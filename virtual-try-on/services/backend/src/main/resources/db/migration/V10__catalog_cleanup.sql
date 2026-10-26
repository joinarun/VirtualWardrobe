ALTER TABLE vw_media_upload ADD COLUMN cleanup_enqueued_at TIMESTAMPTZ;
ALTER TABLE vw_media_upload ADD COLUMN raw_cleanup_enqueued_at TIMESTAMPTZ;
CREATE INDEX vw_media_terminal_cleanup ON vw_media_upload(created_at,id)
 WHERE cleanup_enqueued_at IS NULL AND state IN('AUTHORIZED','UPLOADING','UPLOADED','PROCESSING','REJECTED','DELETED');
CREATE INDEX vw_media_raw_cleanup ON vw_media_upload(created_at,id)
 WHERE raw_cleanup_enqueued_at IS NULL AND state='VALIDATED';
