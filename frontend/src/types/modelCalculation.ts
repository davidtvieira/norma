/**
 * Payload shapes for POST /api/v1/dataset/{datasetId}/model/calculate — the batch endpoint that
 * calculates every operation of a model in one call (see services/datasetApi.ts's
 * calculateModel). Mirrors the backend's ModelOperationInput/ModelCalculateResponse records.
 */

export interface ModelOperationInputPayload {
  id: string;
  kind: string;
  fields: Record<string, unknown>;
}

export interface ModelOperationResultPayload {
  id: string;
  success: boolean;
  value: unknown;
  error: string | null;
}

export interface ModelCalculateResponsePayload {
  results: ModelOperationResultPayload[];
}
