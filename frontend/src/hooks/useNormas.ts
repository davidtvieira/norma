import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSavedNrm, listLibrary } from '../services/datasetApi';
import type { LibraryListingPayload, SavedNrmQuery } from '../types/savedNrm';

/** How long typing in the search box has to pause before the list is asked for again. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * What the library holds, read from the backend whenever `active` turns on (the screen that shows it is open) and
 * again whenever `query` changes — a new search waits for the typing to pause, a new order or level (the folder being
 * looked into) is immediate. The backend does all the narrowing: `listing` is its answer (the folders and the normas
 * found) for the current level, and is null until that answer arrives — never another folder's contents meanwhile.
 * `loading` also covers the wait before a search is asked for. `failed` says it could not be read (the toast already told why).
 */
export function useNormas(active: boolean, query: SavedNrmQuery) {
  // What was listed, and the level it was listed for.
  const [loaded, setLoaded] = useState<{ level: string; folder: string | null; listing: LibraryListingPayload } | null>(null);
  const [failed, setFailed] = useState(false);
  // True while a request (the first one, a search, a new order or folder) is waiting for its answer.
  const [loading, setLoading] = useState(false);
  // True while a search waits for the typing to pause: the answer is on its way, so it counts as loading too.
  const [waiting, setWaiting] = useState(false);
  // Only the newest request may fill the list: an older, slower answer must not overwrite it.
  const latestRequest = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const levelOf = (asked: SavedNrmQuery) => JSON.stringify([asked.folder, asked.everywhere]);

  const refresh = useCallback(() => {
    const request = ++latestRequest.current;
    const asked = queryRef.current;
    setLoading(true);
    return listLibrary(asked)
      .then((listing) => {
        if (request !== latestRequest.current) return;
        setLoaded({ level: JSON.stringify([asked.folder, asked.everywhere]), folder: asked.folder, listing });
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
  const level = levelOf(query);
  useEffect(() => {
    if (!active) return;
    // Typing waits for a pause; opening the screen or changing the order or folder does not.
    const delay = askedSearch.current !== null && askedSearch.current !== query.search ? SEARCH_DEBOUNCE_MS : 0;
    setWaiting(delay > 0);
    const timeoutId = window.setTimeout(() => {
      askedSearch.current = query.search;
      setWaiting(false);
      void refresh();
    }, delay);
    return () => window.clearTimeout(timeoutId);
    // The search and the level are dependencies by value (not the whole query object, which is a new one on every render).
  }, [active, refresh, query.search, query.sort, query.direction, level]);

  const remove = useCallback(
    (id: string) =>
      deleteSavedNrm(id).then(() => {
        setLoaded((current) =>
          current
            ? {
                ...current,
                listing: {
                  ...current.listing,
                  normas: current.listing.normas.filter((model) => model.id !== id),
                  total: Math.max(0, current.listing.total - 1),
                },
              }
            : current,
        );
      }),
    [],
  );

  // Starting or changing a search keeps the folder and only widens the level to "everywhere": the previous list stays
  // on screen (instead of a blank page) until the search's own answer replaces it.
  const listing = loaded !== null && (loaded.level === level || loaded.folder === query.folder) ? loaded.listing : null;
  return { listing, failed, loading: loading || waiting, refresh, remove };
}
