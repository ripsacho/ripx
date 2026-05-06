const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { buildSupportAgentContext } = require('./supportAgentContextService');
const { retrieveSupportKbContext } = require('./supportAiRagService');
const {
  executeReadOnlyTools,
  getAvailableTools,
  selectReadOnlyToolsForMessage,
} = require('./supportAgentToolRegistry');
const { redactForLlm, redactText } = require('./supportAgentRedactionService');
const { logAgentEvent } = require('./llmAuditService');
const { createConfirmationToken } = require('./supportAgentConfirmationService');

const AGENT_MESSAGE_MAX_LENGTH = 2500;
const AGENT_SYSTEM_PROMPT = `You are RipX Agent, a product-aware support and operations assistant.

Rules:
- Use tool results as authoritative app state.
- Never invent store, test, or diagnostic status.
- Never reveal secrets, tokens, API keys, credentials, or redacted values.
- Never claim a mutation happened unless a confirmed tool result says it succeeded.
- For risky actions, propose the action only; do not execute it.
- If store/test context is missing, ask one concise clarification question.
- Keep replies concise, practical, and specific to RipX.`;

function normalizeConversationId(value) {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

async function persistAgentTurn({ conversationId, req, userMessage, assistantReply }) {
  try {
    let convId = normalizeConversationId(conversationId);
    const check = convId
      ? await query(
          `SELECT id FROM support_chat_conversations
           WHERE id = $1
             AND ($2::uuid IS NULL OR user_id = $2)
             AND COALESCE(shop_domain, '') = COALESCE($3, '')`,
          [convId, req.userId || null, req.shopDomain || null]
        )
      : { rows: [] };
    if (!check.rows?.length) {
      const inserted = await query(
        `INSERT INTO support_chat_conversations (user_id, tenant_id, shop_domain, source)
         VALUES ($1, $2, $3, 'ripx_agent')
         RETURNING id`,
        [req.userId || null, req.tenantId || null, req.shopDomain || null]
      );
      convId = inserted.rows?.[0]?.id || null;
    }
    if (!convId) {
      return { conversationId: conversationId || null, assistantMessageId: null };
    }
    const messages = await query(
      `INSERT INTO support_chat_messages (conversation_id, role, content)
       VALUES ($1, 'user', $2), ($1, 'assistant', $3)
       RETURNING id, role`,
      [
        convId,
        String(userMessage || '').slice(0, 50000),
        String(assistantReply || '').slice(0, 50000),
      ]
    );
    return {
      conversationId: convId,
      assistantMessageId: (messages.rows || []).find(row => row?.role === 'assistant')?.id || null,
    };
  } catch (error) {
    logger.warn('Support agent persistence failed', { error: error.message });
    return { conversationId: conversationId || null, assistantMessageId: null };
  }
}

async function loadAgentHistory(conversationId, req) {
  const convId = normalizeConversationId(conversationId);
  if (!convId) {
    return [];
  }
  try {
    const result = await query(
      `SELECT m.role, m.content
       FROM support_chat_conversations c
       INNER JOIN support_chat_messages m ON m.conversation_id = c.id
       WHERE c.id = $1
         AND ($2::uuid IS NULL OR c.user_id = $2)
         AND COALESCE(c.shop_domain, '') = COALESCE($3, '')
         AND m.role IN ('user', 'assistant')
       ORDER BY m.created_at DESC
       LIMIT 8`,
      [convId, req.userId || null, req.shopDomain || null]
    );
    return (result.rows || [])
      .reverse()
      .map(row => ({
        role: row.role === 'assistant' ? 'assistant' : 'user',
        content: redactText(row.content || '').slice(0, 2000),
      }))
      .filter(row => row.content);
  } catch (error) {
    logger.warn('Support agent history load failed', { error: error.message });
    return [];
  }
}

function buildFallbackReply({ context, toolResults, ragStatus, fallbackReason }) {
  const store = context?.store?.domain || 'the selected store';
  const successfulTools = toolResults.filter(result => result.status === 'success');
  const lines = [
    `I checked the available RipX context for ${store}.`,
    successfulTools.length
      ? `I used ${successfulTools.map(result => result.tool).join(', ')}.`
      : 'I could not run any store-specific checks yet.',
  ];
  if (ragStatus && ragStatus !== 'ok') {
    lines.push(`Knowledge base retrieval status: ${ragStatus}.`);
  }
  if (fallbackReason === 'missing_api_key') {
    lines.push(
      'OpenAI is not configured, so this is a safe diagnostic summary rather than a full AI answer.'
    );
  } else if (fallbackReason === 'insufficient_quota' || ragStatus === 'quota_exceeded') {
    lines.push(
      'OpenAI quota is currently exhausted, so this is a safe diagnostic summary instead of a full AI answer.'
    );
  } else {
    lines.push(
      'OpenAI could not complete the request, so this is a safe diagnostic summary instead of a full AI answer.'
    );
  }
  return lines.join(' ');
}

function buildMockReply({ message, context, toolResults, ragStatus }) {
  const store = context?.store?.domain || 'the selected store';
  const toolNames = toolResults.map(result => `${result.tool}: ${result.status}`).join(', ');
  const checks = toolNames || 'no store-specific checks';
  const lower = String(message || '').toLowerCase();
  if (/support ticket|create ticket|contact support|human support|escalate/.test(lower)) {
    return `Mock AI: I can help escalate this for ${store}. I checked ${checks}. Confirm the support ticket action below if you want me to create it.`;
  }
  if (/feature request|roadmap|idea|enhancement/.test(lower)) {
    return `Mock AI: This sounds like a product improvement idea for ${store}. I checked ${checks}. Confirm the feature request action below to add it to the board.`;
  }
  if (/draft|test plan|experiment plan|create.*test|new experiment/.test(lower)) {
    return `Mock AI: I can draft an experiment plan for ${store} without saving or launching anything. I checked ${checks}. Confirm the draft action below to generate it.`;
  }
  return `Mock AI: I reviewed ${store} using ${checks}. RAG status is ${ragStatus || 'not_available'}. This is a development-mode AI response, so you can test the full RipX Agent flow without OpenAI credits.`;
}

function buildOpenAiMessages({ message, history, context, toolResults, rag }) {
  return [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Redacted RipX context:\n${JSON.stringify(context, null, 2)}`,
    },
    {
      role: 'system',
      content: `Read-only tool observations:\n${JSON.stringify(toolResults, null, 2)}`,
    },
    {
      role: 'system',
      content: rag?.context
        ? `Support knowledge base context:\n${rag.context}`
        : `Support knowledge base status: ${rag?.status || 'not_available'}`,
    },
    ...(Array.isArray(history) ? history : []).map(row => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
    })),
    { role: 'user', content: message },
  ];
}

function shouldProposeSupportTicket(message) {
  return /support ticket|create ticket|open ticket|contact support|human support|talk to support|escalate/i.test(
    String(message || '')
  );
}

function shouldProposeFeatureRequest(message) {
  return /feature request|request feature|new feature|add feature|roadmap|enhancement|wish|idea/i.test(
    String(message || '')
  );
}

function shouldProposeDraftTestPlan(message) {
  return /draft.*test|test plan|experiment plan|create.*test|new experiment|plan.*experiment|ab test idea|a\/b test idea/i.test(
    String(message || '')
  );
}

function buildProposedActions({ req, message, conversationId, context, routeContext }) {
  if (String(process.env.SUPPORT_AGENT_ACTIONS_ENABLED || '').toLowerCase() !== 'true') {
    return [];
  }
  const actions = [];
  if (shouldProposeSupportTicket(message) && req.email) {
    const subject = `RipX Agent support request${context?.store?.domain ? ` - ${context.store.domain}` : ''}`;
    const args = {
      subject,
      category: 'technical',
      message: `User asked RipX Agent:\n\n${String(message || '').slice(0, 1500)}`,
      conversation_id: conversationId || null,
      route_context: routeContext || null,
    };
    actions.push({
      id: 'create_support_ticket',
      action: 'create_support_ticket',
      label: 'Create support ticket',
      description: 'Create a support ticket with this agent conversation context.',
      risk: 'low_write',
      requires_confirmation: true,
      confirmation_token: createConfirmationToken({
        action: 'create_support_ticket',
        args,
        req,
        risk: 'low_write',
      }),
      args_preview: {
        subject,
        category: args.category,
      },
    });
  }
  if (shouldProposeFeatureRequest(message) && req.email) {
    const title = `Feature request from RipX Agent${context?.store?.domain ? ` - ${context.store.domain}` : ''}`;
    const args = {
      title,
      details: `User asked RipX Agent:\n\n${String(message || '').slice(0, 1500)}`,
      conversation_id: conversationId || null,
      route_context: routeContext || null,
    };
    actions.push({
      id: 'create_feature_request',
      action: 'create_feature_request',
      label: 'Create feature request',
      description: 'Add this idea to the RipX feature request board.',
      risk: 'low_write',
      requires_confirmation: true,
      confirmation_token: createConfirmationToken({
        action: 'create_feature_request',
        args,
        req,
        risk: 'low_write',
      }),
      args_preview: {
        title,
      },
    });
  }
  if (shouldProposeDraftTestPlan(message) && req.email) {
    const subject = `Draft experiment plan${context?.store?.domain ? ` - ${context.store.domain}` : ''}`;
    const args = {
      subject,
      objective: subject,
      brief: String(message || '').slice(0, 2500),
      conversation_id: conversationId || null,
      route_context: routeContext || null,
    };
    actions.push({
      id: 'draft_test_plan',
      action: 'draft_test_plan',
      label: 'Draft test plan',
      description: 'Generate a draft experiment plan without saving or launching it.',
      risk: 'low_write',
      requires_confirmation: true,
      confirmation_token: createConfirmationToken({
        action: 'draft_test_plan',
        args,
        req,
        risk: 'low_write',
      }),
      args_preview: {
        subject,
        persisted: false,
      },
    });
  }
  return actions.slice(0, 2);
}

async function runSupportAgent(req, body = {}) {
  const startedAt = Date.now();
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!rawMessage) {
    const error = new Error('Message is required');
    error.status = 400;
    throw error;
  }
  if (rawMessage.length > AGENT_MESSAGE_MAX_LENGTH) {
    const error = new Error(`Message must be ${AGENT_MESSAGE_MAX_LENGTH} characters or less`);
    error.status = 400;
    throw error;
  }

  const safeMessage = redactText(rawMessage);
  const context = await buildSupportAgentContext(req, body);
  const history = await loadAgentHistory(body.conversation_id, req);
  const allowClientTools =
    String(process.env.SUPPORT_AGENT_ALLOW_CLIENT_TOOLS || '').toLowerCase() === 'true';
  const requestedTools =
    allowClientTools && Array.isArray(body.tools)
      ? body.tools.filter(item => typeof item === 'string')
      : selectReadOnlyToolsForMessage(safeMessage, context);
  const toolResults = await executeReadOnlyTools(requestedTools, {
    req,
    context,
    shopDomain: context?.store?.domain,
  });
  const rag = await retrieveSupportKbContext(safeMessage, {
    apiKey: process.env.OPENAI_API_KEY,
    topK: 5,
  });

  let reply;
  let outcome = 'success';
  const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
  const mockAiEnabled = String(process.env.SUPPORT_AGENT_MOCK_AI || '').toLowerCase() === 'true';
  if (mockAiEnabled) {
    reply = buildMockReply({ message: safeMessage, context, toolResults, ragStatus: rag.status });
    outcome = 'mock_ai';
  } else if (!process.env.OPENAI_API_KEY) {
    reply = buildFallbackReply({
      context,
      toolResults,
      ragStatus: rag.status,
      fallbackReason: 'missing_api_key',
    });
    outcome = 'fallback_missing_api_key';
  } else {
    try {
      const OpenAI = require('openai').default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model,
        messages: buildOpenAiMessages({
          message: safeMessage,
          history,
          context: redactForLlm(context),
          toolResults,
          rag,
        }),
        max_tokens: Math.min(
          Math.max(parseInt(process.env.OPENAI_CHAT_MAX_TOKENS, 10) || 650, 150),
          1200
        ),
        temperature: 0.2,
      });
      reply =
        completion.choices?.[0]?.message?.content?.trim() ||
        buildFallbackReply({
          context,
          toolResults,
          ragStatus: rag.status,
          fallbackReason: 'empty_completion',
        });
      if (!completion.choices?.[0]?.message?.content?.trim()) {
        outcome = 'fallback_empty_completion';
      }
    } catch (error) {
      logger.warn('Support agent OpenAI error', { error: error.message });
      const reason =
        error?.status === 429 || error?.code === 'insufficient_quota'
          ? 'insufficient_quota'
          : 'openai_error';
      reply = buildFallbackReply({
        context,
        toolResults,
        ragStatus: rag.status,
        fallbackReason: reason,
      });
      outcome = `fallback_${reason}`;
    }
  }

  const persisted = await persistAgentTurn({
    conversationId: body.conversation_id,
    req,
    userMessage: safeMessage,
    assistantReply: reply,
  });
  const conversationId = persisted.conversationId || normalizeConversationId(body.conversation_id);
  const proposedActions = buildProposedActions({
    req,
    message: safeMessage,
    conversationId,
    context,
    routeContext: body.route_context || body.routeContext || null,
  });
  await logAgentEvent(req, {
    action: 'agent_llm_run',
    conversationId,
    model: mockAiEnabled ? 'mock' : process.env.OPENAI_API_KEY ? model : 'fallback',
    tools: toolResults.map(result => result.tool),
    outcome,
    latencyMs: Date.now() - startedAt,
    prompt: safeMessage,
    changes: {
      rag_status: rag.status,
      sources_count: rag.sources?.length || 0,
      history_turns: history.length,
      proposed_actions: proposedActions.map(action => action.action),
    },
  });

  return {
    success: true,
    reply,
    conversation_id: conversationId || undefined,
    assistant_message_id: persisted.assistantMessageId || undefined,
    sources: rag.sources || [],
    rag_status: rag.status,
    tool_results: toolResults,
    available_tools: getAvailableTools(),
    proposed_actions: proposedActions,
  };
}

module.exports = {
  AGENT_MESSAGE_MAX_LENGTH,
  runSupportAgent,
};
