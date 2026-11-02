-- A norma can be saved without a dataset (only the operation kinds that don't read one): its dataset file name is then empty.
ALTER TABLE nrm ALTER COLUMN dataset_filename DROP NOT NULL;
