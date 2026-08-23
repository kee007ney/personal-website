PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  categories TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  categories TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'list' CHECK (state IN ('list', 'cart')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_trips (
  id TEXT PRIMARY KEY,
  purchased_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS history_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES shopping_trips(id) ON DELETE CASCADE,
  catalog_item_id TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog_items(name);
CREATE INDEX IF NOT EXISTS idx_list_state ON list_items(state, created_at);
CREATE INDEX IF NOT EXISTS idx_trip_date ON shopping_trips(purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_trip ON history_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_history_name ON history_items(name);
