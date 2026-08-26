ALTER TABLE households ADD COLUMN note_content TEXT NOT NULL DEFAULT '';
ALTER TABLE households ADD COLUMN note_color TEXT NOT NULL DEFAULT 'default';
ALTER TABLE households ADD COLUMN note_size TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE households ADD COLUMN note_font TEXT NOT NULL DEFAULT 'sans';
ALTER TABLE households ADD COLUMN note_updated_at TEXT NOT NULL DEFAULT '';
