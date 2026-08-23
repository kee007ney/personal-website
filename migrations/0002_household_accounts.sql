PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO households (id, name, created_at)
VALUES ('household-default', 'Our Household', datetime('now'));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS household_invitations (
  token_hash TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

ALTER TABLE catalog_items ADD COLUMN household_id TEXT NOT NULL DEFAULT 'household-default' REFERENCES households(id);
ALTER TABLE list_items ADD COLUMN household_id TEXT NOT NULL DEFAULT 'household-default' REFERENCES households(id);
ALTER TABLE shopping_trips ADD COLUMN household_id TEXT NOT NULL DEFAULT 'household-default' REFERENCES households(id);

CREATE INDEX IF NOT EXISTS idx_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_expiry ON household_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_catalog_household ON catalog_items(household_id, name);
CREATE INDEX IF NOT EXISTS idx_list_household_state ON list_items(household_id, state, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_household_date ON shopping_trips(household_id, purchased_at DESC);
