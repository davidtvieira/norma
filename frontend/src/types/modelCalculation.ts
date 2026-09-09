/**
 * Payload shapes for registering and running a model — see services/datasetApi.ts's
 * registerModel/runModel. Mirrors the backend's ModelOperationInput/ModelRegisterRequest/
 * ModelRegisterResponse/ModelRunRequest/ModelOperationResult records. A model is registered once
 * (POST /api/v1/dataset/{datasetId}/model) against a dataset, getting back a modelId; it's then
 * run repeatedly (POST .../model/{modelId}/run) by that id alone — the operations themselves
 * never need resending, and a run only ever returns one result per designated output (there's
 * always at least one, but there can be more), never every operation's result.
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

export interface ModelRegisterRequestPayload {
  name: string;
  operations: ModelOperationInputPayload[];
  inputOperationIds: string[];
  outputOperationIds: string[];
}

export interface ModelRegisterResponsePayload {
  modelId: string;
}
