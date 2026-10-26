CREATE TABLE vw_category(id UUID PRIMARY KEY,parent_id UUID REFERENCES vw_category(id),name VARCHAR(120) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100));
CREATE TABLE vw_brand(id UUID PRIMARY KEY,store_id UUID REFERENCES vw_store(id),name VARCHAR(120) NOT NULL,logo_media_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100));
CREATE UNIQUE INDEX vw_brand_name_scope ON vw_brand(COALESCE(store_id::text,'global'),LOWER(name));
CREATE TABLE vw_product(
 id UUID PRIMARY KEY,store_id UUID NOT NULL REFERENCES vw_store(id),sku VARCHAR(80) NOT NULL,title VARCHAR(180) NOT NULL,
 description VARCHAR(8000) NOT NULL DEFAULT '',category_id UUID REFERENCES vw_category(id),brand_id UUID REFERENCES vw_brand(id),
 labels JSONB NOT NULL DEFAULT '[]',price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(price>=0),fabric VARCHAR(120) NOT NULL DEFAULT '',
 colour VARCHAR(120) NOT NULL DEFAULT '',size VARCHAR(120) NOT NULL DEFAULT 'Free size',
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','ARCHIVED')),
 availability VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK(availability IN('AVAILABLE','UNAVAILABLE')),
 try_on_enabled BOOLEAN NOT NULL DEFAULT TRUE,cover_media_id UUID,reference_media_id UUID,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100),UNIQUE(store_id,sku)
);
CREATE INDEX vw_product_public_filter ON vw_product(status,store_id,created_at DESC);
CREATE INDEX vw_product_category ON vw_product(category_id);
CREATE TABLE vw_media_upload(
 id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES vw_account(id),store_id UUID REFERENCES vw_store(id),product_id UUID REFERENCES vw_product(id),brand_id UUID REFERENCES vw_brand(id),
 purpose VARCHAR(30) NOT NULL CHECK(purpose IN('PRODUCT_IMAGE','PRODUCT_VIDEO','STORE_LOGO','BRAND_LOGO')),
 declared_mime VARCHAR(100) NOT NULL,declared_bytes BIGINT NOT NULL CHECK(declared_bytes>0),token_hash VARCHAR(64) NOT NULL,
 state VARCHAR(20) NOT NULL CHECK(state IN('AUTHORIZED','UPLOADING','UPLOADED','PROCESSING','VALIDATED','REJECTED','DELETED')),
 object_key VARCHAR(500) NOT NULL,thumbnail_key VARCHAR(500),normalized_mime VARCHAR(100),width INTEGER,height INTEGER,duration_seconds NUMERIC(10,3),
 position INTEGER NOT NULL DEFAULT 0,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,dataset_id VARCHAR(100)
);
CREATE INDEX vw_media_product ON vw_media_upload(product_id,state,position);
CREATE INDEX vw_media_expiry ON vw_media_upload(state,expires_at);
ALTER TABLE vw_product ADD CONSTRAINT vw_product_cover_fk FOREIGN KEY(cover_media_id) REFERENCES vw_media_upload(id);
ALTER TABLE vw_product ADD CONSTRAINT vw_product_reference_fk FOREIGN KEY(reference_media_id) REFERENCES vw_media_upload(id);
ALTER TABLE vw_brand ADD CONSTRAINT vw_brand_logo_fk FOREIGN KEY(logo_media_id) REFERENCES vw_media_upload(id);
ALTER TABLE vw_store ADD COLUMN logo_media_id UUID REFERENCES vw_media_upload(id);
