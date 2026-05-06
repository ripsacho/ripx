import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { confirmSupportAgentAction, sendSupportAgentMessage } from '../../services/supportAgentApi';
import { getAppDomainFromPath } from '../../utils/breadcrumb';

function createMessageId(role) {
  return `${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildRouteContext(location) {
  const path = location?.pathname || '';
  const testMatch = path.match(/\/tests\/([^/]+)/);
  return {
    pathname: path,
    test_id: testMatch?.[1] || null,
    page: path.split('/').filter(Boolean).slice(-1)[0] || 'home',
  };
}

export default function useRipxAssistant() {
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState('');

  const routeContext = useMemo(() => buildRouteContext(location), [location]);
  const store = useMemo(() => getAppDomainFromPath(location.pathname) || '', [location.pathname]);

  const sendMessage = useCallback(
    async value => {
      const text = String(value || input || '').trim();
      if (!text || loading) return;
      setInput('');
      setError('');
      setLoading(true);
      setMessages(prev => [...prev, { id: createMessageId('user'), role: 'user', content: text }]);
      try {
        const response = await sendSupportAgentMessage({
          message: text,
          conversation_id: conversationId || undefined,
          store: store || undefined,
          route_context: routeContext,
        });
        setConversationId(response.conversation_id || conversationId || null);
        setMessages(prev => [
          ...prev,
          {
            id: response.assistant_message_id || createMessageId('assistant'),
            role: 'assistant',
            content: response.reply || 'I could not generate an answer.',
            sources: response.sources || [],
            toolResults: response.tool_results || [],
            proposedActions: response.proposed_actions || [],
          },
        ]);
      } catch (err) {
        const message = err?.response?.data?.error || err?.message || 'RipX Agent is unavailable.';
        setError(message);
        setMessages(prev => [
          ...prev,
          {
            id: createMessageId('assistant'),
            role: 'assistant',
            content: message,
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, input, loading, routeContext, store]
  );

  const clear = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError('');
    setInput('');
  }, []);

  const confirmAction = useCallback(
    async action => {
      if (!action?.confirmation_token || actionLoadingId) return;
      setActionLoadingId(action.id || action.action);
      setError('');
      try {
        const response = await confirmSupportAgentAction({
          confirmation_token: action.confirmation_token,
          store: store || undefined,
        });
        setMessages(prev => [
          ...prev,
          {
            id: createMessageId('assistant'),
            role: 'assistant',
            content:
              response.action === 'create_support_ticket'
                ? `Support ticket created: ${response.result?.ticket_id || 'created'}.`
                : response.action === 'create_feature_request'
                  ? `Feature request created: ${response.result?.feature_request_id || 'created'}.`
                  : response.action === 'draft_test_plan'
                    ? `Draft test plan ready: ${response.result?.draft?.name || 'AI drafted experiment'}.`
                    : 'Action completed.',
            toolResults:
              response.action === 'draft_test_plan' && response.result
                ? [
                    {
                      tool: 'draft_test_plan',
                      status: response.result.validation?.valid ? 'valid' : 'needs_review',
                      data: response.result.draft,
                    },
                  ]
                : [],
          },
        ]);
      } catch (err) {
        const message = err?.response?.data?.error || err?.message || 'Could not complete action.';
        setError(message);
        setMessages(prev => [
          ...prev,
          {
            id: createMessageId('assistant'),
            role: 'assistant',
            content: message,
            error: true,
          },
        ]);
      } finally {
        setActionLoadingId('');
      }
    },
    [actionLoadingId, store]
  );

  return {
    messages,
    input,
    setInput,
    loading,
    actionLoadingId,
    error,
    routeContext,
    sendMessage,
    confirmAction,
    clear,
  };
}
