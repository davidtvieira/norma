-- A category's name is at most 50 characters (CategoryService.MAX_NAME_LENGTH). Names longer than that, which only an
-- earlier version allowed, are cut so the narrower column fits them.
UPDATE category SET name = left(name, 50) WHERE char_length(name) > 50;

ALTER TABLE category ALTER COLUMN name TYPE VARCHAR(50);
