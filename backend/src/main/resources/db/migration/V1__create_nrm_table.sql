-- The library of saved .nrm files. The files themselves live in the storage folder (norma.storage.dir), named
-- after their id; this table only holds what is needed to list them and to find them again.
CREATE TABLE nrm (
    id               UUID                     PRIMARY KEY,
    name             VARCHAR(255)             NOT NULL,
    dataset_filename VARCHAR(255)             NOT NULL,
    size_bytes       BIGINT                   NOT NULL,
    sha256           VARCHAR(64)              NOT NULL,
    operation_count  INTEGER                  NOT NULL,
    input_count      INTEGER                  NOT NULL,
    output_count     INTEGER                  NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX nrm_updated_at_idx ON nrm (updated_at DESC);
