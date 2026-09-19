ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'work' CHECK (type IN ('private', 'work'));
