CREATE TABLE vw_tryon_consent(
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES vw_account(id),version VARCHAR(120) NOT NULL,
 provider VARCHAR(80) NOT NULL,model VARCHAR(160) NOT NULL,location VARCHAR(80) NOT NULL,notice TEXT NOT NULL,
 adult BOOLEAN NOT NULL CHECK(adult),own_photo BOOLEAN NOT NULL CHECK(own_photo),provider_processing BOOLEAN NOT NULL CHECK(provider_processing),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100)
);
CREATE TABLE vw_private_media(
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES vw_account(id),product_id UUID REFERENCES vw_product(id),consent_id UUID REFERENCES vw_tryon_consent(id),job_id UUID,
 purpose VARCHAR(10) NOT NULL CHECK(purpose IN('SOURCE','OUTPUT')),
 state VARCHAR(20) NOT NULL CHECK(state IN('AUTHORIZED','UPLOADING','UPLOADED','PROCESSING','ACTIVE','SAVING','SAVED','DELETED','REJECTED')),
 declared_mime VARCHAR(100) NOT NULL,declared_bytes BIGINT NOT NULL CHECK(declared_bytes>0),token_hash VARCHAR(64),
 raw_key VARCHAR(500),object_key VARCHAR(500),pending_key VARCHAR(500),width INTEGER,height INTEGER,
 cap_expires_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 saved_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,dataset_id VARCHAR(100)
);
CREATE INDEX vw_private_media_owner ON vw_private_media(owner_id,purpose,state);
CREATE INDEX vw_private_media_expiry ON vw_private_media(state,expires_at);
CREATE TABLE vw_generation_day(
 day DATE PRIMARY KEY,accepted_requests INTEGER NOT NULL DEFAULT 0 CHECK(accepted_requests>=0),
 reserved_usd NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK(reserved_usd>=0),committed_usd NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK(committed_usd>=0),
 observed_usd NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK(observed_usd>=0)
);
CREATE TABLE vw_customer_generation_day(owner_id UUID NOT NULL REFERENCES vw_account(id),day DATE NOT NULL,used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),PRIMARY KEY(owner_id,day));
CREATE TABLE vw_tryon_job(
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES vw_account(id),product_id UUID NOT NULL REFERENCES vw_product(id),source_id UUID NOT NULL UNIQUE REFERENCES vw_private_media(id),output_id UUID REFERENCES vw_private_media(id),
 idempotency_key VARCHAR(100) NOT NULL,fingerprint VARCHAR(64) NOT NULL,product_snapshot JSONB NOT NULL,
 state VARCHAR(20) NOT NULL CHECK(state IN('QUEUED','RUNNING','SUCCEEDED','FAILED','EXPIRED','CANCELLED')),
 provider VARCHAR(80) NOT NULL,model VARCHAR(160) NOT NULL,demo BOOLEAN NOT NULL,evaluation_demo BOOLEAN NOT NULL,
 quota_day DATE NOT NULL,allowance_refunded BOOLEAN NOT NULL DEFAULT FALSE,dispatch_sequence INTEGER NOT NULL DEFAULT 1,
 dispatched_at TIMESTAMPTZ,claim_token UUID,attempts INTEGER NOT NULL DEFAULT 0,error_code VARCHAR(100),error_message VARCHAR(500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deadline_at TIMESTAMPTZ NOT NULL,discarded_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,dataset_id VARCHAR(100),UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX vw_tryon_job_owner ON vw_tryon_job(owner_id,created_at DESC);
CREATE INDEX vw_tryon_job_pending ON vw_tryon_job(state,deadline_at,dispatched_at);
ALTER TABLE vw_private_media ADD CONSTRAINT vw_private_media_job_fk FOREIGN KEY(job_id) REFERENCES vw_tryon_job(id);
CREATE TABLE vw_tryon_attempt(
 job_id UUID NOT NULL REFERENCES vw_tryon_job(id),sequence INTEGER NOT NULL,reserved_usd NUMERIC(14,6) NOT NULL,
 outcome VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',accounting_settled BOOLEAN NOT NULL DEFAULT FALSE,
 claim_token UUID,provider_started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ,observed_usd NUMERIC(14,6) NOT NULL DEFAULT 0,
 input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,thought_tokens INTEGER NOT NULL DEFAULT 0,
 dataset_id VARCHAR(100),PRIMARY KEY(job_id,sequence)
);
CREATE TABLE vw_task_delivery(job_id UUID NOT NULL REFERENCES vw_tryon_job(id),sequence INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,processed_at TIMESTAMPTZ,PRIMARY KEY(job_id,sequence));
CREATE TABLE vw_object_deletion(object_key VARCHAR(500) PRIMARY KEY,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,final_check_at TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,dataset_id VARCHAR(100));
