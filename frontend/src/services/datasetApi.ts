import type { DatasetImportResponse } from '../types/dataset';
import type { LookupRequestPayload, LookupResponsePayload } from '../types/lookup';
import type { ModelCalculateResponsePayload, ModelOperationInputPayload } from '../types/modelCalculation';
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
 * Calculates every operation of a model in one call: the API resolves chained (reference)
 * inputs between operations itself and returns every result together, instead of the frontend
 * calling one operation endpoint per entry and stitching the chain together client-side. Used
 * only when utilizing an already-built model (ModelCard) — the editing page (OperationPanel)
 * keeps calling the individual /api/v1/dataset/operation/{lookup,sum} endpoints per operation as
 * it's being built, where a live per-field result is what's wanted.
 */
export async function calculateModel(
  datasetId: string,
  operations: ModelOperationInputPayload[],
): Promise<ModelCalculateResponsePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? `Falha ao calcular o modelo (estado ${response.status})`);
  }

  return response.json();
}
