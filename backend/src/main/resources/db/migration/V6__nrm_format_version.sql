-- The version of the .nrm format each saved file is in (1: always carries a dataset; 2: may leave it out), read from its info.json
-- whenever it is saved or replaced. The files already saved were all written by this app, which writes version 2 only
-- when there is no dataset.
ALTER TABLE nrm ADD COLUMN format_version INTEGER;
UPDATE nrm SET format_version = CASE WHEN dataset_filename IS NULL THEN 2 ELSE 1 END;
ALTER TABLE nrm ALTER COLUMN format_version SET NOT NULL;
