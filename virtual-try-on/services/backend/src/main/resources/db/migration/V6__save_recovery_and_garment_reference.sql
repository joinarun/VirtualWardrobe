ALTER TABLE vw_private_media ADD COLUMN saving_started_at TIMESTAMPTZ;
CREATE INDEX vw_private_media_stale_save ON vw_private_media(saving_started_at) WHERE state='SAVING';
ALTER TABLE vw_tryon_job ADD COLUMN garment_media_id UUID REFERENCES vw_media_upload(id);
UPDATE vw_tryon_job j SET garment_media_id=p.reference_media_id FROM vw_product p WHERE p.id=j.product_id;
