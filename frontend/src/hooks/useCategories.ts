import { useCallback, useEffect, useState } from 'react';
import { listCategories } from '../services/datasetApi';
import type { CategoryNode } from '../types/category';

/**
 * The library's categories as a tree, read from the backend whenever `active` turns on (a screen that shows or
 * picks categories is open). `refresh` reads them again — after anything that changes a category or moves a norma,
 * since the counts change too. `tree` is null until the first answer arrives (the toast says why if it never does).
 */
export function useCategories(active: boolean) {
  const [tree, setTree] = useState<CategoryNode[] | null>(null);

  const refresh = useCallback(
    () =>
      listCategories()
        .then(setTree)
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  return { tree, refresh };
}
