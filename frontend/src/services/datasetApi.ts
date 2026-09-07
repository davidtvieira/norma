import type { DatasetImportResponse } from '../types/dataset';

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
