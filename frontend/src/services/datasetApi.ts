import { ApiError, reportApiError } from './apiErrors';
import type { CalcRequestPayload, CalcResponsePayload } from '../types/calc';
import type { CounterRequestPayload, CounterResponsePayload } from '../types/counter';
import type { DatasetImportResponse, DatasetImportStatus } from '../types/dataset';
import type { FindRequestPayload, FindResponsePayload } from '../types/find';
import type { LookupRequestPayload, LookupResponsePayload } from '../types/lookup';
import type {
  ModelInputsPayload,
  ModelOperationInputPayload,
  ModelRegisterResponsePayload,
  ModelRunResponsePayload,
} from '../types/modelCalculation';
import type { SelectorRequestPayload, SelectorResponsePayload } from '../types/selector';
import type { NrmImportStatusPayload, NrmInfoPayload, NrmOpenPayload } from '../types/nrm';
import type { SavedNrmPayload, SavedNrmQuery } from '../types/savedNrm';
import type { NodeRequestPayload, NodeResponsePayload } from '../types/node';
import type { OperationType } from '../types/operation';
import type { SumRequestPayload, SumResponsePayload } from '../types/sum';
import type { TranslatorRequestPayload, TranslatorResponsePayload } from '../types/translator';

/**
 * Defaults to a same-origin relative path so the browser only ever talks to whatever
 * single host/port actually reaches it (dev server proxies /api to the backend — see
 * vite.config.ts). Set VITE_API_BASE_URL to override when the backend lives elsewhere.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const INVALID_NRM_MESSAGE = 'Ficheiro .nrm inválido.';
const MODEL_DATASET_MISMATCH_MESSAGE = 'O modelo não é compatível com o conjunto de dados: usa folhas que o conjunto de dados não tem.';
const CONFLICT_STATUS = 409;
const UNREACHABLE_MESSAGE = 'Não foi possível contactar o servidor.';
const COMMUNICATION_ERROR_MESSAGE = 'Erro de comunicação com a API.';
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** fetch, except a request that never got an HTTP response at all (backend down, network error)
 * is reported to the toasts too, with a readable message instead of the browser's own. */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    reportApiError({ title: UNREACHABLE_MESSAGE });
    throw new ApiError(UNREACHABLE_MESSAGE, { cause: error });
  }
}

/** Builds (and reports to the toasts) the error for a non-OK response: `title` says what failed,
 * the server's own message, when it sent one, is the detail. The returned Error's message is the
 * server's message if any, else the title with the HTTP status — what callers have always got. */
async function apiError(response: Response, title: string): Promise<ApiError> {
  // A gateway answering for a backend it couldn't reach (Bad Gateway, Service Unavailable, Gateway
  // Timeout): same situation as apiFetch's no-response case, and whatever text the proxy sent
  // ("Bad Gateway", an HTML page...) says nothing useful to the user.
  if (GATEWAY_STATUSES.has(response.status)) {
    reportApiError({ title: COMMUNICATION_ERROR_MESSAGE });
    return new ApiError(COMMUNICATION_ERROR_MESSAGE);
  }
  const errorBody = await response.json().catch(() => null);
  const serverMessage: string | undefined = errorBody?.message;
  reportApiError({ title, detail: serverMessage ?? `Estado ${response.status}` });
  return new ApiError(serverMessage ?? `${title} (estado ${response.status})`);
}

/**
 * Uploads a dataset file to the backend, which parses and stores it, returning only the import's
 * status and the dataset's id (the sheets are read on demand, see getDataset).
 */
export async function importDataset(file: File): Promise<DatasetImportStatus> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao importar o conjunto de dados');
  }

  return response.json();
}

/**
 * Checks that an already-imported dataset is still stored, by its id, without fetching its sheets
 * — what a reloaded page uses to find out whether its URL's dataset survived. Deliberately not
 * reported to the toasts: an id the backend no longer knows (it restarted) is an expected outcome
 * there, handled by re-importing the cached file instead.
 */
export async function checkDataset(datasetId: string): Promise<DatasetImportStatus> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/status`);
  if (!response.ok) {
    throw new Error(`Conjunto de dados não encontrado (estado ${response.status})`);
  }
  return response.json();
}

/**
 * Fetches an imported dataset's contents (filename and every sheet) by its id — only needed by
 * the screen that actually displays them (the editor).
 */
export async function getDataset(datasetId: string): Promise<DatasetImportResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}`);
  if (!response.ok) {
    throw new Error(`Conjunto de dados não encontrado (estado ${response.status})`);
  }
  return response.json();
}

async function postNrm<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch(`${API_BASE_URL}${path}`, { method: 'POST', body: formData });

  if (response.status === CONFLICT_STATUS) {
    reportApiError({ title: MODEL_DATASET_MISMATCH_MESSAGE });
    throw new ApiError(MODEL_DATASET_MISMATCH_MESSAGE);
  }

  if (!response.ok) {
    // The backend's reason (see its NrmService) stays out of the UI on purpose — a rejected .nrm
    // just reads as invalid, whatever exactly was wrong with it.
    const errorBody = await response.json().catch(() => null);
    console.warn('.nrm rejeitado pelo backend:', response.status, errorBody?.message ?? errorBody);
    reportApiError({ title: INVALID_NRM_MESSAGE });
    throw new ApiError(INVALID_NRM_MESSAGE);
  }

  return response.json();
}

/**
 * Uploads a .nrm to the backend, which validates its actual content (the frontend only ever
 * checks the extension) and, if valid, parses and stores its dataset like importDataset does.
 */
export function importNrm(file: File): Promise<NrmImportStatusPayload> {
  return postNrm('/api/v1/nrm/import', file);
}

/** The library of saved .nrm files, most recently saved first unless `query` says otherwise. */
export async function listSavedNrms(query?: SavedNrmQuery): Promise<SavedNrmPayload[]> {
  const params = new URLSearchParams();
  if (query?.search.trim()) params.set('search', query.search.trim());
  if (query) {
    params.set('sort', query.sort);
    params.set('direction', query.direction);
  }
  const queryString = params.size > 0 ? `?${params}` : '';
  const response = await apiFetch(`${API_BASE_URL}/api/v1/library${queryString}`);
  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter os modelos guardados');
  }
  return response.json();
}

async function sendSavedNrm(url: string, method: 'POST' | 'PUT', file: File): Promise<SavedNrmPayload> {
  const body = new FormData();
  body.append('file', file);
  const response = await apiFetch(url, { method, body });
  if (!response.ok) {
    throw await apiError(response, 'Falha ao guardar o modelo');
  }
  return response.json();
}

/** Keeps a .nrm in the library (the backend validates it like an import does). */
export function saveNrm(file: File): Promise<SavedNrmPayload> {
  return sendSavedNrm(`${API_BASE_URL}/api/v1/library`, 'POST', file);
}

/** Puts a .nrm in place of a saved one, keeping its id. */
export function replaceSavedNrm(id: string, file: File): Promise<SavedNrmPayload> {
  return sendSavedNrm(`${API_BASE_URL}/api/v1/library/${encodeURIComponent(id)}`, 'PUT', file);
}

/** Brings a saved .nrm into use from the file the backend already keeps — nothing is uploaded. */
export async function openSavedNrm(id: string): Promise<NrmOpenPayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/library/${encodeURIComponent(id)}/open`, { method: 'POST' });
  if (!response.ok) {
    throw await apiError(response, 'Falha ao abrir o modelo guardado');
  }
  return response.json();
}

/** A saved .nrm's file, only for what needs the file itself (exporting it again, renaming it) — opening needs none. */
export async function downloadSavedNrm(id: string, name = 'modelo'): Promise<File> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/library/${encodeURIComponent(id)}/file`);
  if (!response.ok) {
    throw await apiError(response, 'Falha ao abrir o modelo guardado');
  }
  return new File([await response.blob()], `${name}.nrm`, { type: 'application/octet-stream' });
}

export async function deleteSavedNrm(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw await apiError(response, 'Falha ao apagar o modelo');
  }
}

/** Same content validation as importNrm, but stores nothing — for when only the model half of the
 * .nrm is wanted. */
export function validateNrm(file: File): Promise<NrmInfoPayload> {
  return postNrm('/api/v1/nrm/validate', file);
}

/**
 * Checks, before a model is accepted, that it can use an already-imported dataset (every sheet its
 * operations point at exists in it), so an incompatible model is refused on import instead of
 * failing later on the editor or utilize screen. `modelText` is the model JSON as exported.
 */
export async function validateModelForDataset(datasetId: string, modelText: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: modelText,
  });

  if (response.status === CONFLICT_STATUS) {
    reportApiError({ title: MODEL_DATASET_MISMATCH_MESSAGE });
    throw new ApiError(MODEL_DATASET_MISMATCH_MESSAGE);
  }
  if (!response.ok) {
    throw await apiError(response, 'Falha ao validar o modelo');
  }
}

/**
 * Fetches the kinds of operation the API supports (id and display label), so the frontend
 * doesn't hardcode operation names that only the backend should own.
 */
export async function listOperationTypes(): Promise<OperationType[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operations`);

  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter os tipos de operação');
  }

  return response.json();
}

/**
 * Runs a lookup operation against a previously imported dataset. All the matching (scanning
 * the search range, result table/column, row correspondence) happens on the API — the frontend
 * only sends the inputs and renders the returned value.
 */
export async function lookupValue(payload: LookupRequestPayload): Promise<LookupResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao procurar o valor');
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
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao procurar a posição');
  }

  return response.json();
}

/**
 * Sums the numeric values of every cell within a rectangular range, against a previously
 * imported dataset. The range filtering, numeric-cell filtering and summing all happen on the
 * API — the frontend only sends the inputs and renders the returned total.
 */
export async function sumColumn(payload: SumRequestPayload): Promise<SumResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/sum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao somar a coluna');
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
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/counter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao somar as entradas');
  }

  return response.json();
}

/**
 * Does arithmetic on two already-resolved values (add, subtract, multiply or divide, then an
 * optional rounding or absolute value). Like a counter, a calc has no dataset dependency.
 */
export async function calcValues(payload: CalcRequestPayload): Promise<CalcResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/calc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao calcular');
  }

  return response.json();
}

/**
 * Passes a single value straight through. A node has no dataset dependency and does no
 * computation — this exists purely so a node's live "result" (reportable to a chained operation
 * the same way any other kind's is) goes through the API, same as every other kind's.
 */
export async function nodeValue(payload: NodeRequestPayload): Promise<NodeResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao processar o valor');
  }

  return response.json();
}

/**
 * Translates a value against a user-defined source→target mapping table — the actual lookup (and
 * its "no two rules can share a source" / "no rule for this value" validation) happens on the API,
 * same as every other kind's own computation. No dataset dependency, same as counter/node: the
 * rules are entirely user-defined, not read from any table. Unlike lookup/find, a value with no
 * matching rule rejects (a non-ok response) rather than resolving to a calm "not found" result —
 * see TranslatorResponsePayload's own note.
 */
export async function translateValue(payload: TranslatorRequestPayload): Promise<TranslatorResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/translator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao traduzir o valor');
  }

  return response.json();
}

/**
 * Registers a model against a previously imported dataset, once, so it can be run repeatedly
 * afterwards (see runModel) without resending its operations on every run — only the model's id,
 * kept server-side, and (on each run) the values a caller supplies for its designated input
 * operations, if it has any (a model can have several, each filled in separately). Called when the
 * user picks Utilizar on an already-built model (see App.tsx's prepareUtilize) — the editing page (OperationPanel) keeps calling
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
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, operations, inputOperationIds, outputOperationIds }),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao preparar o modelo');
  }

  return response.json();
}

/**
 * Fetches what someone utilizing a registered model needs before running it — just its inputs to
 * fill in, without any of the operations behind them. Outputs only come back with a run.
 */
export async function getModelInputs(modelId: string, { silent = false } = {}): Promise<ModelInputsPayload> {
  const url = `${API_BASE_URL}/api/v1/model/${encodeURIComponent(modelId)}/inputs`;
  if (silent) {
    // For asking whether a model is still registered, where "no" is an expected outcome (the
    // backend restarted) the caller handles by registering it again — so no toast for it.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Modelo não encontrado (estado ${response.status})`);
    }
    return response.json();
  }

  const response = await apiFetch(url);

  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter as entradas do modelo');
  }

  return response.json();
}

/**
 * Same as getModelInputs, for a model that came with an imported .nrm — addressed by the .nrm's id.
 */
export async function getNrmInputs(nrmId: string, { silent = false } = {}): Promise<ModelInputsPayload> {
  const url = `${API_BASE_URL}/api/v1/nrm/${encodeURIComponent(nrmId)}/inputs`;
  if (silent) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NRM não encontrado (estado ${response.status})`);
    }
    return response.json();
  }

  const response = await apiFetch(url);
  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter as entradas do modelo');
  }
  return response.json();
}

/** One operation of a registered model with its configuration — read-only, for looking at it. */
export async function getModelOperation(modelId: string, operationId: string): Promise<ModelOperationInputPayload> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/v1/model/${encodeURIComponent(modelId)}/operations/${encodeURIComponent(operationId)}`,
  );
  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter a operação');
  }
  return response.json();
}

/** Same as getModelOperation, for a model that came with an imported .nrm. */
export async function getNrmOperation(nrmId: string, operationId: string): Promise<ModelOperationInputPayload> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/v1/nrm/${encodeURIComponent(nrmId)}/operations/${encodeURIComponent(operationId)}`,
  );
  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter a operação');
  }
  return response.json();
}

/** Runs an imported .nrm's model by the .nrm's id — the dataset and model are already known to it. */
export async function runNrm(
  nrmId: string,
  inputValues: Record<string, string>,
  watchIds: string[] = [],
): Promise<ModelRunResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/nrm/${encodeURIComponent(nrmId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputValues, watchIds }),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao correr o modelo');
  }

  return response.json();
}

/**
 * An imported .nrm's model JSON (the same text the file held, ready for parseModelImport), by the
 * .nrm's id — only fetched when the model is opened for editing; using it never needs it.
 */
export async function getNrmModel(nrmId: string): Promise<string> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/nrm/${encodeURIComponent(nrmId)}/model`);
  if (!response.ok) {
    throw await apiError(response, 'Falha ao obter o modelo');
  }
  return response.text();
}

/** An imported .nrm's dataset (filename and every sheet), by the .nrm's id. */
export async function getNrmDataset(nrmId: string): Promise<DatasetImportResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/nrm/${encodeURIComponent(nrmId)}/dataset`);
  if (!response.ok) {
    throw new Error(`Conjunto de dados não encontrado (estado ${response.status})`);
  }
  return response.json();
}

/**
 * Runs a previously registered model — resolving chained (reference) inputs between its
 * operations server-side, the same way as a single-operation call — and returns one result per
 * designated output (always at least one), not every operation's. `inputValues`, keyed by
 * operation id, replaces each of the model's designated input operations' literal value for this
 * run (pass an empty object when the model has none). `watchIds` asks for the value of those
 * operations too (any in the model), returned as `watched`.
 */
export async function runModel(
  datasetId: string,
  modelId: string,
  inputValues: Record<string, string>,
  watchIds: string[] = [],
): Promise<ModelRunResponsePayload> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/v1/dataset/${encodeURIComponent(datasetId)}/model/${encodeURIComponent(modelId)}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputValues, watchIds }),
    },
  );

  if (!response.ok) {
    throw await apiError(response, 'Falha ao correr o modelo');
  }

  return response.json();
}

/**
 * Picks one of the given already-resolved values by zero-based index — the actual selection (and
 * its "index must be a whole number inside the values" validation) happens on the API, same as
 * every other kind's own computation. No dataset dependency, same as counter/node.
 */
export async function selectValue(payload: SelectorRequestPayload): Promise<SelectorResponsePayload> {
  const response = await apiFetch(`${API_BASE_URL}/api/v1/dataset/operation/selector`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await apiError(response, 'Falha ao selecionar o valor');
  }

  return response.json();
}
