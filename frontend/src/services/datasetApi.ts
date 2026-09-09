import type { CounterRequestPayload, CounterResponsePayload } from '../types/counter';
import type { DatasetImportResponse } from '../types/dataset';
import type { FindRequestPayload, FindResponsePayload } from '../types/find';
import type { LookupRequestPayload, LookupResponsePayload } from '../types/lookup';
import type {
  ModelOperationInputPayload,
  ModelOperationResultPayload,
  ModelRegisterResponsePayload,
} from '../types/modelCalculation';
import type { NodeRequestPayload, NodeResponsePayload } from '../types/node';
import type { OperationType } from '../types/operation';
import type { SumRequestPayload, SumResponsePayload } from '../types/sum';

/**
 * Defaults to a same-origin relative path so the browser only ever talks to whatever
 * single host/port actually reaches it (dev server proxies /api to the backend — see
 * vite.config.ts). Set VITE_API_BASE_URL to override when the backend lives elsewhere.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Uploads a dataset file to the backend and returns the parsed sheet JSON.
 */
export async function importDataset(file: File): Promise<DatasetImportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao importar o conjunto de dados (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches the kinds of operation the API supports (id and display label), so the frontend
 * doesn't hardcode operation names that only the backend should own.
 */
export async function listOperationTypes(): Promise<OperationType[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operations`);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao obter os tipos de operação (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Runs a lookup operation against a previously imported dataset. All the matching (scanning
 * the search range, result table/column, row correspondence) happens on the API — the frontend
 * only sends the inputs and renders the returned value.
 */
export async function lookupValue(payload: LookupRequestPayload): Promise<LookupResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operation/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao procurar o valor (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Searches every cell within a rectangular range, against a previously imported dataset, for the
 * first one matching the query, and returns its position. Unlike lookup (which reads a value from
 * a different column of the matched row), the range scanning and matching happen on the API and
 * the frontend only renders the returned row/column index.
 */
export async function findMatch(payload: FindRequestPayload): Promise<FindResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operation/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao procurar a posição (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Sums the numeric values of every cell within a rectangular range, against a previously
 * imported dataset. The range filtering, numeric-cell filtering and summing all happen on the
 * API — the frontend only sends the inputs and renders the returned total.
 */
export async function sumColumn(payload: SumRequestPayload): Promise<SumResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operation/sum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao somar a coluna (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Adds up however many already-resolved values it's given. Unlike lookup/sum, a counter has no
 * dataset dependency of its own — each value was already resolved client-side (a typed literal,
 * or another operation's own live result) before this is called, so no datasetId/table/column/
 * range is sent, only the values — the API just does the actual addition.
 */
export async function counterValues(payload: CounterRequestPayload): Promise<CounterResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operation/counter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao somar as entradas (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Passes a single value straight through. A node has no dataset dependency and does no
 * computation — this exists purely so a node's live "result" (reportable to a chained operation
 * the same way any other kind's is) goes through the API, same as every other kind's.
 */
export async function nodeValue(payload: NodeRequestPayload): Promise<NodeResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/operation/node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao processar o valor (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Registers a model against a previously imported dataset, once, so it can be run repeatedly
 * afterwards (see runModel) without resending its operations on every run — only the model's id,
 * kept server-side, and (on each run) the values a caller supplies for its designated input
 * operations, if it has any (a model can have several, each filled in separately). Used only when
 * utilizing an already-built model (ModelCard) — the editing page (OperationPanel) keeps calling
 * the individual /api/v1/dataset/operation/{lookup,sum,counter,node} endpoints per operation as
 * it's being built, where a live per-field result is what's wanted.
 */
export async function registerModel(
  datasetId: string,
  name: string,
  operations: ModelOperationInputPayload[],
  inputOperationIds: string[],
  outputOperationIds: string[],
): Promise<ModelRegisterResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, operations, inputOperationIds, outputOperationIds }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao preparar o modelo (estado ${response.status})`);
  }

  return response.json();
}

/**
 * Runs a previously registered model — resolving chained (reference) inputs between its
 * operations server-side, the same way as a single-operation call — and returns one result per
 * designated output (always at least one), not every operation's. `inputValues`, keyed by
 * operation id, replaces each of the model's designated input operations' literal value for this
 * run (pass an empty object when the model has none).
 */
export async function runModel(
  datasetId: string,
  modelId: string,
  inputValues: Record<string, string>,
): Promise<ModelOperationResultPayload[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model/${encodeURIComponent(modelId)}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputValues }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao correr o modelo (estado ${response.status})`);
  }

  return response.json();
}
