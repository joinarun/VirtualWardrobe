ALTER TABLE vw_recovery_code ADD COLUMN dataset_id VARCHAR(100);
CREATE TABLE vw_demo_dataset(
 id VARCHAR(50) PRIMARY KEY,profile VARCHAR(20) NOT NULL CHECK(profile IN('standard','load')),
 fingerprint VARCHAR(64) NOT NULL,credential_digest VARCHAR(64) NOT NULL,credentials_json TEXT NOT NULL,credentials_text TEXT NOT NULL,
 state VARCHAR(20) NOT NULL CHECK(state IN('PREPARING','ACTIVE','DELETING','DELETED')),
 target_products INTEGER NOT NULL,lease_token UUID,lease_expires_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 activated_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,cleanup_counts JSONB
);
CREATE TABLE vw_demo_object(
 object_key VARCHAR(500) PRIMARY KEY,dataset_id VARCHAR(50) NOT NULL REFERENCES vw_demo_dataset(id),
 content_hash VARCHAR(64) NOT NULL,content_type VARCHAR(100) NOT NULL,bytes BIGINT NOT NULL CHECK(bytes>0),
 state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','STORED','DELETED')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX vw_demo_object_dataset ON vw_demo_object(dataset_id,state);
