ALTER TABLE projects ADD COLUMN parent_project_id INTEGER REFERENCES projects(id);
