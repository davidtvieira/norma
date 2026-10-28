-- Categories to file the saved normas under: two levels at most (a category and its subcategories, enforced by the
-- service). A norma sits in one category, or in none. Deleting a category is refused by the service while it still has
-- subcategories or normas, so the foreign keys never need to cascade.
CREATE TABLE category (
    id         UUID                     PRIMARY KEY,
    parent_id  UUID                     REFERENCES category (id),
    name       VARCHAR(255)             NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- A name is unique among its siblings (and among the top-level categories), whatever its case.
CREATE UNIQUE INDEX category_sibling_name_idx
    ON category (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

ALTER TABLE nrm ADD COLUMN category_id UUID REFERENCES category (id);

CREATE INDEX nrm_category_id_idx ON nrm (category_id);
