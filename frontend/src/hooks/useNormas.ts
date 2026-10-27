import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSavedNrm, listSavedNrms } from '../services/datasetApi';
import type { SavedNrmPayload, SavedNrmQuery } from '../types/savedNrm';

/** How long typing in the search box has to pause before the list is asked for again. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The library of saved .nrm files, read from the backend whenever `active` turns on (the screen that shows
 * them is open) and again whenever `query` changes — a new search waits for the typing to pause, a new order
 * is immediate. `models` is null until the first answer arrives; `failed` says the list could not be read (the
 * toast already told why).
 */
export function useNormas(active: boolean, query: SavedNrmQuery) {
  const [models, setModels] = useState<SavedNrmPayload[] | null>(null);
  const [failed, setFailed] = useState(false);
  // True while a request (the first one, a search or a new order) is waiting for its answer.
  const [loading, setLoading] = useState(false);
  // How many models the library holds, whatever the search: read off any answer that was not searched.
  const [total, setTotal] = useState<number | null>(null);
  // Only the newest request may fill the list: an older, slower answer must not overwrite it.
  const latestRequest = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const refresh = useCallback(() => {
    const request = ++latestRequest.current;
    setLoading(true);
    return listSavedNrms(queryRef.current)
      .then((list) => {
        if (request !== latestRequest.current) return;
        setModels(list);
        if (!queryRef.current.search.trim()) setTotal(list.length);
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
    // Typing waits for a pause; opening the screen or changing the order does not.
    const delay = askedSearch.current !== null && askedSearch.current !== query.search ? SEARCH_DEBOUNCE_MS : 0;
    const timeoutId = window.setTimeout(() => {
      askedSearch.current = query.search;
      refresh();
    }, delay);
    return () => window.clearTimeout(timeoutId);
    // The search is a dependency by value (not the whole query object, which is a new one on every render).
  }, [active, refresh, query.search, query.sort, query.direction]);

  const remove = useCallback(
    (id: string) =>
      deleteSavedNrm(id).then(() => {
        setModels((current) => current?.filter((model) => model.id !== id) ?? current);
        setTotal((current) => (current === null ? current : Math.max(0, current - 1)));
      }),
    [],
  );

  return { models, total, failed, loading, refresh, remove };
}
