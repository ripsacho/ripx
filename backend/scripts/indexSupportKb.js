#!/usr/bin/env node
/**
 * Index Support Knowledge Base – chunk markdown/text files and insert into support_kb_chunks
 * for RAG (POST /api/support/chat). Requires migration 050 (pgvector + support_kb_chunks).
 *
 * Usage:
 *   npm run index-support-kb [directory]
 *   npm run index-support-kb -- --no-embed   # content only (no OpenAI); use when quota exceeded
 *   npm run index-support-kb -- --clear      # delete all chunks
 *   node backend/scripts/indexSupportKb.js docs
 *   node backend/scripts/indexSupportKb.js --clear
 *   node backend/scripts/indexSupportKb.js --no-embed
 *
 * Environment: DATABASE_URL, OPENAI_API_KEY (unless --no-embed). Chunk size ~512 tokens (~2000 chars), 10% overlap.
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const { query, closeDatabase } = require('../src/utils/database');

const CHUNK_CHARS = 2000; // ~512 tokens at ~4 chars/token
const CHUNK_OVERLAP = 200; // ~10% overlap
const EMBEDDING_MODEL = 'text-embedding-3-small';
const DIM = 1536;

function extractText(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.replace(/\r\n/g, '\n').trim();
}

/**
 * Split content into chunks with overlap. Prefer paragraph/sentence boundaries when possible.
 */
function chunkText(content, sourceLabel) {
  const chunks = [];
  const paragraphs = content.split(/\n\n+/);
  let buffer = '';
  let start = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i] + (i < paragraphs.length - 1 ? '\n\n' : '');
    if (buffer.length + para.length <= CHUNK_CHARS && buffer.length > 0) {
      buffer += para;
    } else {
      if (buffer.length > 0) {
        chunks.push(buffer.trim());
        start = buffer.length - CHUNK_OVERLAP;
        if (start < 0) {
          start = 0;
        }
        buffer = buffer.slice(-CHUNK_OVERLAP) + para;
      } else {
        buffer = para;
      }
      while (buffer.length >= CHUNK_CHARS) {
        const take = buffer.slice(0, CHUNK_CHARS);
        const lastSpace = take.lastIndexOf(' ');
        const cut = lastSpace > CHUNK_CHARS * 0.7 ? lastSpace : CHUNK_CHARS;
        chunks.push(buffer.slice(0, cut).trim());
        buffer = buffer.slice(cut - CHUNK_OVERLAP);
      }
    }
  }
  if (buffer.trim().length > 0) {
    chunks.push(buffer.trim());
  }
  return chunks.map((c, i) => ({ content: c, index: i, source: sourceLabel }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getEmbedding(text, apiKey, retries = 3) {
  const OpenAI = require('openai').default;
  const openai = new OpenAI({ apiKey });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      });
      const embedding = res?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== DIM) {
        throw new Error(`Unexpected embedding length: ${embedding?.length}`);
      }
      return embedding;
    } catch (err) {
      const isRateLimit = err.status === 429 || err.code === 'insufficient_quota';
      if (isRateLimit && attempt < retries) {
        const waitMs = 5000 * attempt;
        console.warn(
          `  Rate limited, waiting ${waitMs / 1000}s before retry (${attempt}/${retries})...`
        );
        await sleep(waitMs);
        continue;
      } else if (isRateLimit) {
        console.error(
          '\nOpenAI quota exceeded. Add billing at https://platform.openai.com, or run with --no-embed to index content only (no RAG until you re-run with embeddings).'
        );
      }
      throw err;
    }
  }
}

async function insertChunk(client, source, chunkIndex, content, embedding) {
  if (embedding === null) {
    await client.query(
      `INSERT INTO support_kb_chunks (source, chunk_index, content, embedding)
       VALUES ($1, $2, $3, NULL)`,
      [source, chunkIndex, content]
    );
    return;
  }
  const vecStr = `[${embedding.join(',')}]`;
  await client.query(
    `INSERT INTO support_kb_chunks (source, chunk_index, content, embedding)
     VALUES ($1, $2, $3, $4::vector)`,
    [source, chunkIndex, content, vecStr]
  );
}

async function clearChunks(client, source = null) {
  if (source) {
    await client.query('DELETE FROM support_kb_chunks WHERE source = $1', [source]);
  } else {
    await client.query('DELETE FROM support_kb_chunks');
  }
}

async function run() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const clearOnly = process.argv.includes('--clear');
  const noEmbed = process.argv.includes('--no-embed');
  const dir = args[0] || path.join(__dirname, '../../docs');

  const { getClient, withTransaction } = require('../src/utils/database');

  async function ensureTable() {
    const r = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_kb_chunks'"
    );
    if (!r.rows.length) {
      throw new Error(
        'Table support_kb_chunks not found. Run migration 050_pgvector_support_kb.sql first.'
      );
    }
  }

  if (clearOnly) {
    await ensureTable();
    const client = await getClient();
    try {
      await clearChunks(client);
      console.log('Cleared all support_kb_chunks.');
    } finally {
      client.release();
    }
    await closeDatabase();
    return;
  }

  await ensureTable();

  if (!noEmbed && !process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY is required (or use --no-embed to index content only without embeddings).'
    );
    process.exit(1);
  }

  if (noEmbed) {
    console.log(
      'Running in --no-embed mode: chunks will have no embeddings (RAG will not match until you re-run with embeddings).'
    );
  }

  const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error('Directory not found:', absDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(absDir)
    .filter(f => /\.(md|txt|markdown)$/i.test(f))
    .map(f => path.join(absDir, f));

  if (files.length === 0) {
    console.log('No .md/.txt files in', absDir);
    await closeDatabase();
    return;
  }

  let totalInserted = 0;

  for (const filePath of files) {
    const sourceLabel = path.relative(path.dirname(absDir), filePath).replace(/\\/g, '/');
    const content = extractText(filePath);
    if (!content) {
      console.log('Skip (empty):', sourceLabel);
      continue;
    }
    const chunks = chunkText(content, sourceLabel);
    console.log(sourceLabel, '→', chunks.length, 'chunks');

    await withTransaction(async client => {
      await clearChunks(client, sourceLabel);
      for (let i = 0; i < chunks.length; i++) {
        const { content: text, index, source } = chunks[i];
        const embedding = noEmbed ? null : await getEmbedding(text, process.env.OPENAI_API_KEY);
        await insertChunk(client, source, index, text, embedding);
        totalInserted++;
        if (!noEmbed) {
          await sleep(150);
        }
      }
    });
  }

  console.log('Done. Total chunks indexed:', totalInserted);
  await closeDatabase();
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
