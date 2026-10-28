import type { ValueFormat } from './valueFormat';
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
  /** Display name, only so the backend can label this operation if it's a designated input/output. */
  name?: string;
}

/** A part of the dataset a run's output chain read (mirrors the backend's DatasetTouch). */
export interface DatasetTouchPayload {
  sheetIndex: number;
  role: 'search' | 'result';
  shape: 'column' | 'range' | 'cell';
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  label?: string | null;
}

export interface ModelOperationResultPayload {
  id: string;
  success: boolean;
  value: unknown;
  error: string | null;
  /** The operation's display name — only set on a run's designated outputs. */
  name?: string | null;
  /** Only on a run's designated outputs: everything the output's chain read from the dataset. */
  touches?: DatasetTouchPayload[] | null;
}

export interface ModelRegisterRequestPayload {
  name: string;
  operations: ModelOperationInputPayload[];
  inputOperationIds: string[];
  outputOperationIds: string[];
}

export interface ModelRegisterResponsePayload {
  modelId: string;
  inputs: ModelInputFieldPayload[];
  operations: ModelOperationRefPayload[];
}

/** One operation of a registered model as it can be picked to watch — id, display name and kind
 * only, never its configuration. */
export interface ModelOperationRefPayload {
  id: string;
  name: string;
  kind: string;
}

/** What a model run returns: the designated outputs, plus the extra operations asked for. */
export interface ModelRunResponsePayload {
  results: ModelOperationResultPayload[];
  watched: ModelOperationResultPayload[];
}

/** One designated input of a registered model (GET .../model/{modelId}/inputs) — just enough to
 * render it; `value` is its starting literal. Never carries the operation's configuration. */
export interface ModelInputFieldPayload {
  id: string;
  name: string;
  kind: string;
  value: string;
  /** The rules a formatter operation puts on this input (null or absent when none does). */
  format?: ValueFormat | null;
}

export interface ModelInputsPayload {
  inputs: ModelInputFieldPayload[];
  operations: ModelOperationRefPayload[];
}
