import { useEffect, useState } from 'react';
import { getDataset, getNrmDataset } from '../services/datasetApi';
import type { DatasetImportResponse } from '../types/dataset';

// One request per dataset id, shared across mounts so React StrictMode's dev-only mount → cleanup
// → mount reuses it instead of fetching the sheets twice. Cleared on failure so a later mount can
// retry. A dataset's contents never change for a given id, so there is nothing to invalidate.
const requests = new Map<string, Promise<DatasetImportResponse>>();

function loadDatasetSheets(datasetId: string, nrmId?: string): Promise<DatasetImportResponse> {
  let request = requests.get(datasetId);
  if (!request) {
    request = (nrmId ? getNrmDataset(nrmId) : getDataset(datasetId)).catch((error) => {
      requests.delete(datasetId);
      throw error;
    });
    requests.set(datasetId, request);
  }
  return request;
}

/** Starts (or joins) the download of a dataset's sheets without using them yet — lets a caller have
 * them ready by the time the editor mounts, so it never has to render empty while they arrive. */
export function preloadDatasetSheets(datasetId: string, nrmId?: string): Promise<void> {
  return loadDatasetSheets(datasetId, nrmId).then(() => undefined);
}

/** Loads the full dataset (sheets included) for the screens that display it — through the .nrm's
 * id when the dataset came from one. Null while loading;
 * `error` is set instead if it could not be read. */
export function useDatasetSheets(datasetId: string, nrmId?: string): { dataset: DatasetImportResponse | null; error: string | null } {
  const [state, setState] = useState<{ datasetId: string; dataset: DatasetImportResponse | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDatasetSheets(datasetId, nrmId)
      .then((dataset) => {
        if (!cancelled) setState({ datasetId, dataset, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ datasetId, dataset: null, error: error instanceof Error ? error.message : 'Falha ao obter os dados.' });
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, nrmId]);

  return state?.datasetId === datasetId ? { dataset: state.dataset, error: state.error } : { dataset: null, error: null };
}
