/**
 * A kind of operation the API can run against a dataset (e.g. "lookup"). Fetched from
 * /api/v1/dataset/operations instead of being hardcoded in the frontend, so new operation
 * types show up automatically as the API adds them.
 */
export interface OperationType {
  id: string;
  label: string;
}
