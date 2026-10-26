ALTER TABLE vw_enquiry ADD COLUMN contact_retention_days INTEGER NOT NULL DEFAULT 180 CHECK(contact_retention_days BETWEEN 1 AND 3650);
UPDATE vw_enquiry SET contact_retention_days=SUBSTRING(consent_version FROM '-r([0-9]+)$')::INTEGER WHERE consent_version~'-r[0-9]{1,4}$' AND SUBSTRING(consent_version FROM '-r([0-9]+)$')::INTEGER BETWEEN 1 AND 3650;
