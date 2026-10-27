-- Preserve real legacy attestations and the legacy writer's INSERT shape during coordinated rollout.
ALTER TABLE vw_tryon_consent ADD COLUMN request_basis VARCHAR(24) NOT NULL DEFAULT 'LEGACY_ATTESTATION';
ALTER TABLE vw_tryon_consent ALTER COLUMN adult DROP NOT NULL;
ALTER TABLE vw_tryon_consent ALTER COLUMN own_photo DROP NOT NULL;
ALTER TABLE vw_tryon_consent ALTER COLUMN provider_processing DROP NOT NULL;
ALTER TABLE vw_tryon_consent DROP CONSTRAINT vw_tryon_consent_adult_check;
ALTER TABLE vw_tryon_consent DROP CONSTRAINT vw_tryon_consent_own_photo_check;
ALTER TABLE vw_tryon_consent DROP CONSTRAINT vw_tryon_consent_provider_processing_check;
ALTER TABLE vw_tryon_consent ADD CONSTRAINT vw_tryon_request_basis_check CHECK (
 (request_basis='LEGACY_ATTESTATION' AND adult IS TRUE AND own_photo IS TRUE AND provider_processing IS TRUE)
 OR (request_basis='USER_ACTION' AND adult IS NULL AND own_photo IS NULL AND provider_processing IS NULL)
);
