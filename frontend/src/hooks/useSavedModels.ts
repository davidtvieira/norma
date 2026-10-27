import { useCallback, useEffect, useState } from 'react';
import { deleteSavedNrm, listSavedNrms } from '../services/datasetApi';
import type { SavedNrmPayload } from '../types/savedNrm';

/**
 * The library of saved .nrm files, read from the backend whenever `active` turns on (the screen that shows
 * them is open). `models` is null until the first answer arrives; `failed` says the list could not be read
 * (the toast already told why).
 */
export function useSavedModels(active: boolean) {
  const [models, setModels] = useState<SavedNrmPayload[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    return listSavedNrms()
      .then((list) => {
        setModels(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  const remove = useCallback(
    (id: string) => deleteSavedNrm(id).then(() => setModels((current) => current?.filter((model) => model.id !== id) ?? current)),
    [],
  );

  return { models, failed, refresh, remove };
}
