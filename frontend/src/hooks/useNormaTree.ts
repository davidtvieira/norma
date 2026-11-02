import { useCallback, useEffect, useRef, useState } from 'react';
import { listCategories, listLibrary } from '../services/datasetApi';
import type { CategoryNode } from '../types/category';
import type { SavedNrmPayload, SavedNrmQuery } from '../types/savedNrm';

/** How long typing in the search box has to pause before the tree is asked for again. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * What the tree view of "As minhas normas" shows: the whole folder tree (GET /categories) and every norma the search
 * finds, wherever it is filed (GET /library with `everywhere`), read whenever `active` turns on and again when the
 * search or the order change (typing waits for a pause). `refresh` reads both again — after anything that creates,
 * renames, moves or deletes a folder or a norma. `data` is null until the first answer; `total` is how many normas the
 * whole library holds, whatever the search says.
 */
export function useNormaTree(active: boolean, query: Pick<SavedNrmQuery, 'search' | 'sort' | 'direction'>) {
  const [data, setData] = useState<{ categories: CategoryNode[]; normas: SavedNrmPayload[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Only the newest request may fill the tree: an older, slower answer must not overwrite it.
  const latestRequest = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const refresh = useCallback(() => {
    const request = ++latestRequest.current;
    const asked = queryRef.current;
    setLoading(true);
    return Promise.all([
      listCategories(),
      listLibrary({ search: asked.search, sort: asked.sort, direction: asked.direction, folder: null, everywhere: true }),
    ])
      .then(([categories, listing]) => {
        if (request !== latestRequest.current) return;
        setData({ categories, normas: listing.normas, total: listing.total });
        setFailed(false);
      })
      .catch(() => {
        if (request === latestRequest.current) setFailed(true);
      })
      .finally(() => {
        if (request === latestRequest.current) setLoading(false);
      });
  }, []);

  const askedSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const delay = askedSearch.current !== null && askedSearch.current !== query.search ? SEARCH_DEBOUNCE_MS : 0;
    setWaiting(delay > 0);
    const timeoutId = window.setTimeout(() => {
      askedSearch.current = query.search;
      setWaiting(false);
      void refresh();
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [active, refresh, query.search, query.sort, query.direction]);

  return { data, failed, loading: loading || waiting, refresh };
}
