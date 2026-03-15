-- Support AI chat history: conversations and messages for future review and analytics.
-- Migration: 048_support_chat_history.sql
-- See docs/CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md and docs/SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md

-- Conversations: one per chat session (or per first message if no session id from client).
CREATE TABLE IF NOT EXISTS support_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  shop_domain VARCHAR(255),
  source VARCHAR(50) DEFAULT 'support_page',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_support_chat_conv_user_id ON support_chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_conv_created_at ON support_chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_chat_conv_tenant_id ON support_chat_conversations(tenant_id) WHERE tenant_id IS NOT NULL;

-- Messages: each user and assistant turn stored for audit and future retrieval.
CREATE TABLE IF NOT EXISTS support_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_support_chat_msg_conversation_id ON support_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_msg_created_at ON support_chat_messages(conversation_id, created_at);

-- Trigger to update conversation updated_at when a message is added
CREATE OR REPLACE FUNCTION update_support_chat_conv_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_chat_messages_updated_at ON support_chat_messages;
CREATE TRIGGER support_chat_messages_updated_at
  AFTER INSERT ON support_chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_support_chat_conv_updated_at();
