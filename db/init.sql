CREATE TABLE IF NOT EXISTS social_integrations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at DATETIME,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sender_id TEXT,
  sender_name TEXT,
  last_message_at DATETIME,
  unread_count INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  sender_id TEXT,
  text TEXT,
  media_urls TEXT,
  direction TEXT,
  received_at DATETIME,
  is_read BOOLEAN DEFAULT 0,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES dm_threads(id)
);

CREATE TABLE IF NOT EXISTS posting_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT,
  status TEXT NOT NULL,
  approved_by TEXT,
  approved_at DATETIME,
  posted_at DATETIME,
  scheduled_for DATETIME,
  instagram_post_id TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES social_integrations(id)
);

CREATE INDEX IF NOT EXISTS idx_dm_threads_thread_id ON dm_threads(thread_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_id ON dm_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_posting_queue_status ON posting_queue(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_integrations_platform_account
  ON social_integrations(platform, account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_threads_user_thread
  ON dm_threads(user_id, thread_id);
