import { useEffect, useState } from 'react';
import { listOperationTypes } from '../services/datasetApi';
import type { OperationType } from '../types/operation';

// Shared across mounts so React StrictMode's dev-only mount → cleanup → mount (and any other
// panel mounting the hook) reuses one request instead of hitting the API again. Cleared on
// failure so a later mount can retry.
let operationTypesRequest: Promise<OperationType[]> | null = null;

function loadOperationTypes(): Promise<OperationType[]> {
  if (!operationTypesRequest) {
    operationTypesRequest = listOperationTypes().catch((error) => {
      operationTypesRequest = null;
      throw error;
    });
  }
  return operationTypesRequest;
}

/**
 * Fetches the operation types the API supports (id + display label) once, on mount. Each
 * operation panel looks up its own type by id (e.g. 'lookup', 'sum') instead of assuming
 * array order, so this can be shared across panels without them stepping on each other.
 */
export function useOperationTypes(): OperationType[] {
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);

  useEffect(() => {
    let cancelled = false;

    loadOperationTypes()
      .then((types) => {
        if (!cancelled) {
          setOperationTypes(types);
        }
      })
      .catch(() => {
        // Callers fall back to a generic label when their type isn't found in the result.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return operationTypes;
}
