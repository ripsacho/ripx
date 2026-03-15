-- pgvector extension and support_kb_chunks table for RAG (Phase 2 support AI).
-- Requires PostgreSQL with pgvector installed. See docs/FEATURES_PENDING_AND_ROADMAP.md.
-- Migration: 050_pgvector_support_kb.sql
--
-- If this migration is skipped with "extension vector is not available", install pgvector:
--   macOS (Homebrew PG17/18):  brew install pgvector
--   macOS (Homebrew PG16):     brew install pgvector installs for PG17/18 only; build from source:
--       git clone https://github.com/pgvector/pgvector.git && cd pgvector && PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" make && make install
--   Ubuntu/Debian:             sudo apt install postgresql-16-pgvector  (or your PG version)
--   Docker:                   use image e.g. pgvector/pgvector:pg16
-- Then run: npm run migrate

CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base chunks: content + embedding for similarity search.
-- source = file path or doc id; chunk_index = order within source.
CREATE TABLE IF NOT EXISTS support_kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(1024) NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_kb_chunks_source ON support_kb_chunks(source);
CREATE INDEX IF NOT EXISTS idx_support_kb_chunks_created_at ON support_kb_chunks(created_at DESC);

-- HNSW index for approximate nearest neighbor (cosine distance).
-- m=16, ef_construction=64 per research; use for retrieval.
CREATE INDEX IF NOT EXISTS idx_support_kb_chunks_embedding_hnsw
  ON support_kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
