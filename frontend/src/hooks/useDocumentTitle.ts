import { useEffect } from 'react';

const APP_NAME = 'Norma';

/** Sets the browser tab's title to "<page> · Norma" (just "Norma" when there is no page name). */
export function useDocumentTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME;
  }, [page]);
}
