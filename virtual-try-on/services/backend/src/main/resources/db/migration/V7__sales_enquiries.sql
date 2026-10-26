CREATE TABLE vw_enquiry(
 id UUID PRIMARY KEY,customer_id UUID NOT NULL REFERENCES vw_account(id),store_id UUID NOT NULL REFERENCES vw_store(id),product_id UUID NOT NULL REFERENCES vw_product(id),
 product_snapshot JSONB NOT NULL,contact_name VARCHAR(120) NOT NULL,contact_phone VARCHAR(30),phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
 consent_version VARCHAR(120) NOT NULL,consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 contact_state VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK(contact_state IN('AVAILABLE','REMOVED_ACCOUNT','EXPIRED')),contact_redacted_at TIMESTAMPTZ,
 status VARCHAR(40) NOT NULL DEFAULT 'NEW' CHECK(status IN('NEW','OPEN','IN_PROGRESS','AWAITING_CUSTOMER_RESPONSE','CUSTOMER_REPLIED','CLOSED')),
 assignee_id UUID REFERENCES vw_account(id),outcome VARCHAR(30) CHECK(outcome IN('CONTACTED','CONVERTED','NOT_INTERESTED','UNREACHABLE')),
 closed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100),
 CHECK((status='NEW' AND assignee_id IS NULL) OR status='CLOSED' OR (status<>'NEW' AND assignee_id IS NOT NULL)),
 CHECK((status='CLOSED' AND outcome IS NOT NULL AND closed_at IS NOT NULL) OR (status<>'CLOSED' AND outcome IS NULL AND closed_at IS NULL))
);
CREATE UNIQUE INDEX vw_enquiry_one_active ON vw_enquiry(customer_id,product_id,store_id) WHERE status<>'CLOSED';
CREATE INDEX vw_enquiry_store_updated ON vw_enquiry(store_id,status,updated_at DESC);
CREATE INDEX vw_enquiry_customer_updated ON vw_enquiry(customer_id,updated_at DESC);
CREATE INDEX vw_enquiry_assignee_active ON vw_enquiry(assignee_id,store_id) WHERE status<>'CLOSED';
CREATE INDEX vw_enquiry_contact_retention ON vw_enquiry(closed_at) WHERE status='CLOSED' AND contact_state='AVAILABLE';
CREATE TABLE vw_enquiry_event(
 id BIGSERIAL PRIMARY KEY,enquiry_id UUID NOT NULL REFERENCES vw_enquiry(id),actor_id UUID REFERENCES vw_account(id),
 event_type VARCHAR(40) NOT NULL,visibility VARCHAR(10) NOT NULL CHECK(visibility IN('PUBLIC','INTERNAL')),body TEXT,
 from_status VARCHAR(40),to_status VARCHAR(40),from_assignee_id UUID REFERENCES vw_account(id),to_assignee_id UUID REFERENCES vw_account(id),outcome VARCHAR(30),
 redacted BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100)
);
CREATE INDEX vw_enquiry_event_order ON vw_enquiry_event(enquiry_id,id);
