import { useEffect, useState } from 'react';
import { listOperationTypes } from '../services/datasetApi';
import type { OperationType } from '../types/operation';

/**
 * Fetches the operation types the API supports (id + display label) once, on mount. Each
 * operation panel looks up its own type by id (e.g. 'lookup', 'sum') instead of assuming
 * array order, so this can be shared across panels without them stepping on each other.
 */
export function useOperationTypes(): OperationType[] {
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);

  useEffect(() => {
    let cancelled = false;

    listOperationTypes()
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
