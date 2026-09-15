CREATE UNIQUE INDEX idx_projects_one_inbox_per_user ON projects(user_id) WHERE is_inbox = 1;
