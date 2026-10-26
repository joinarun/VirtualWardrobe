CREATE TABLE app_installation (
    installation_id INTEGER PRIMARY KEY CHECK (installation_id = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_installation (installation_id) VALUES (1);
