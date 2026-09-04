-- 010_paper_chat.sql
-- Chat sessions and messages for "Chat with Paper" (Q&A) feature.

CREATE TABLE IF NOT EXISTS paper_chat_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id   UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT DEFAULT 'Chat Session',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_chat_sessions_paper_user 
  ON paper_chat_sessions(paper_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS paper_chat_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES paper_chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_chat_messages_session 
  ON paper_chat_messages(session_id, created_at ASC);
