const { query } = require('../utils/database');
const logger = require('../utils/logger');

const DEFAULT_TOP_K = 5;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

async function retrieveSupportKbContext(queryText, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const topK = Math.max(1, Math.min(parseInt(options.topK, 10) || DEFAULT_TOP_K, 10));
  const embeddingModel =
    options.embeddingModel || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const input = String(queryText || '').trim();

  if (!input) {
    return { status: 'empty_query', context: '', sources: [] };
  }
  if (!apiKey) {
    return { status: 'missing_api_key', context: '', sources: [] };
  }

  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey });
    const embRes = await openai.embeddings.create({
      model: embeddingModel,
      input: input.slice(0, 8000),
    });
    const embedding = embRes?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return { status: 'invalid_embedding', context: '', sources: [] };
    }

    const vecStr = `[${embedding.join(',')}]`;
    const result = await query(
      `SELECT content, source FROM support_kb_chunks
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, topK]
    );

    if (!result.rows?.length) {
      return { status: 'no_chunks', context: '', sources: [] };
    }

    const context = result.rows
      .map((row, index) => `[${index + 1}] ${String(row.content || '').trim()}`)
      .join('\n\n');
    const sources = [...new Set(result.rows.map(row => row.source).filter(Boolean))];
    return { status: 'ok', context, sources };
  } catch (error) {
    logger.warn('Support AI RAG retrieval failed', { error: error.message });
    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      return { status: 'quota_exceeded', context: '', sources: [] };
    }
    return { status: 'error', context: '', sources: [] };
  }
}

module.exports = {
  retrieveSupportKbContext,
};
