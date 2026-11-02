-- The version of the .nrm format is not kept in the library table after all (V6 added it): the file itself carries it in info.json.
ALTER TABLE nrm DROP COLUMN format_version;
