import { strToU8, unzip, zipSync } from 'fflate';
import { importNrm, validateNrm } from '../services/datasetApi';
import type { DatasetImportResponse } from '../types/dataset';
import { parseModelImport, type ExportedModel, type SerializableEntry } from './modelSerialization';

export class NrmImportError extends Error {}

/** Fixed entry name of the info file inside a .nrm — see NrmInfo. */
const INFO_ENTRY_NAME = 'info.json';

/**
 * Metadata about the .nrm file itself (as opposed to the model or dataset it bundles), stored as
 * `info.json` inside it. Meant to grow: new fields go here as optional ones, so a .nrm written
 * before a field existed still reads back fine (see readNrmInfo).
 */
export interface NrmInfo {
  version: 1;
  /** The name the file was saved under (without the .nrm extension). */
  name: string;
  /** ISO 8601 timestamp of when the file was created (exported). */
  createdAt: string;
}

const NRM_INFO_VERSION = 1;

export interface NrmContents {
  /** The dataset spreadsheet found inside the .nrm, ready to hand to importDataset as-is. */
  datasetFile: File;
  /** The model JSON text found inside the .nrm, ready to hand to parseModelImport as-is. */
  modelText: string;
  /** The .nrm's own info.json — null for a .nrm built before it existed (or by hand), or one whose
   * info.json is unreadable; never a reason to reject the file. */
  info: NrmInfo | null;
}

function isInfoEntry(path: string): boolean {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase() === INFO_ENTRY_NAME;
}

/** Tolerant on purpose (same spirit as modelSerialization's readPosition): anything malformed
 * just reads as "no info" instead of failing the whole import. */
function readNrmInfo(bytes: Uint8Array | undefined): NrmInfo | null {
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes)) as Record<string, unknown>;
    return {
      version: NRM_INFO_VERSION,
      name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    };
  } catch {
    return null;
  }
}

function isSpreadsheetEntry(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function isModelEntry(path: string): boolean {
  return path.toLowerCase().endsWith('.json') && !isInfoEntry(path);
}

/**
 * Unpacks a .nrm file — a plain zip bundling an already-imported dataset's spreadsheet alongside
 * an exported model JSON, so a caller can skip uploading each separately. Entries are matched by
 * extension rather than a fixed required filename, so a .nrm built by hand (zip a spreadsheet and
 * a model .json together, rename to .nrm) works the same as one this app might produce itself.
 */
export function extractNrmFile(file: File): Promise<NrmContents> {
  return file
    .arrayBuffer()
    .catch(() => {
      throw new NrmImportError('Não foi possível ler o ficheiro .nrm.');
    })
    .then(
      (buffer) =>
        new Promise<NrmContents>((resolve, reject) => {
          unzip(new Uint8Array(buffer), (error, entries) => {
            if (error) {
              reject(new NrmImportError('Ficheiro .nrm inválido: não é um arquivo zip válido.'));
              return;
            }

            const paths = Object.keys(entries).filter((path) => !path.endsWith('/'));
            const spreadsheetPaths = paths.filter(isSpreadsheetEntry);
            const modelPaths = paths.filter(isModelEntry);
            const infoPath = paths.find(isInfoEntry);

            if (spreadsheetPaths.length === 0) {
              reject(new NrmImportError('Ficheiro .nrm inválido: não contém um conjunto de dados (.xlsx/.xls).'));
              return;
            }
            if (spreadsheetPaths.length > 1) {
              reject(new NrmImportError('Ficheiro .nrm inválido: contém mais do que um conjunto de dados.'));
              return;
            }
            if (modelPaths.length === 0) {
              reject(new NrmImportError('Ficheiro .nrm inválido: não contém um modelo (.json).'));
              return;
            }
            if (modelPaths.length > 1) {
              reject(new NrmImportError('Ficheiro .nrm inválido: contém mais do que um modelo.'));
              return;
            }

            const spreadsheetPath = spreadsheetPaths[0];
            const datasetBytes = entries[spreadsheetPath];
            const datasetFilename = spreadsheetPath.slice(spreadsheetPath.lastIndexOf('/') + 1);
            const datasetFile = new File([datasetBytes], datasetFilename, {
              type: 'application/octet-stream',
            });

            const modelText = new TextDecoder('utf-8').decode(entries[modelPaths[0]]);

            resolve({ datasetFile, modelText, info: readNrmInfo(infoPath ? entries[infoPath] : undefined) });
          });
        }),
    );
}

/**
 * Builds a .nrm — the same zip shape extractNrmFile reads back — bundling the dataset's own
 * spreadsheet (its original filename/bytes, unchanged) together with the exported model JSON.
 * Used by "Guardar modelo", which now saves .nrm instead of a bare model JSON file so the one
 * saved file is also enough to reopen the model later without the dataset having to be imported
 * separately first (see ReadyModelUploader's landing-page counterpart). Also writes an
 * `info.json` (see NrmInfo) recording `fileName` and when this file was created.
 */
export async function buildNrmFile(datasetFile: File, model: ExportedModel, fileName: string): Promise<Blob> {
  const datasetBytes = new Uint8Array(await datasetFile.arrayBuffer());
  const info: NrmInfo = { version: NRM_INFO_VERSION, name: fileName, createdAt: new Date().toISOString() };
  const zipped = zipSync({
    [datasetFile.name]: datasetBytes,
    'modelo.json': strToU8(JSON.stringify(model, null, 2)),
    [INFO_ENTRY_NAME]: strToU8(JSON.stringify(info, null, 2)),
  });
  return new Blob([zipped], { type: 'application/octet-stream' });
}

/**
 * Reads a model file for "Importar Modelo", which — now that "Guardar modelo" exports .nrm
 * instead of a bare model JSON — has to accept both: a .nrm's own embedded model JSON (the
 * dataset half is ignored here, since importing a model for an already-loaded dataset is exactly
 * the case where a second copy of it isn't wanted), or, for a model exported before this change,
 * the plain JSON file itself.
 */
export async function readModelFile(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.nrm')) {
    await validateNrm(file);
    const { modelText } = await extractNrmFile(file);
    return modelText;
  }
  return file.text();
}

export interface NrmImportResult {
  dataset: DatasetImportResponse;
  datasetFile: File;
  model: {
    modelName: string;
    nrmName: string;
    entries: SerializableEntry[];
    inputOperationIds: string[];
    outputOperationIds: string[];
  };
}

/**
 * The full .nrm -> ready-to-use-state pipeline: have the backend validate the file's content and
 * import its dataset half, unzip it locally for the dataset's bytes, parse the model half — in one call so both ReadyModelUploader (a freshly picked file)
 * and a "recent" entry (the exact same bytes replayed from utils/recentModels.ts) share one
 * implementation instead of two copies of the same three steps.
 */
export async function importNrmFile(file: File, knownKindIds: Set<string>): Promise<NrmImportResult> {
  const { dataset, info: backendInfo } = await importNrm(file);
  const { datasetFile, modelText } = await extractNrmFile(file);
  const imported = parseModelImport(modelText, knownKindIds);
  return {
    dataset,
    datasetFile,
    model: {
      modelName: imported.modelName,
      // info.json is the source of truth; a .nrm without one falls back to the name carried in its
      // model JSON, then to its own filename, so it always has something to identify it by in
      // "Sessões recentes".
      nrmName: backendInfo.name || imported.nrmName || file.name.replace(/\.nrm$/i, ''),
      entries: imported.entries,
      inputOperationIds: imported.inputOperationIds,
      outputOperationIds: imported.outputOperationIds,
    },
  };
}
