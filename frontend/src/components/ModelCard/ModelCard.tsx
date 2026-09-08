import { useEffect, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { OperationFields } from '../OperationPanel/operationKind';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { resolveOperationInputs } from '../../utils/resolveOperationInputs';
import type { SerializableEntry } from '../../utils/modelSerialization';
import { calculateModel } from '../../services/datasetApi';
import { formatCellValue } from '../../utils/sheet';
import './ModelCard.css';

interface ModelCardProps {
  dataset: DatasetImportResponse;
  modelName: string;
  entries: SerializableEntry[];
}

const CALCULATE_DEBOUNCE_MS = 800;

/**
 * A model previously built in the editor and re-imported to be used, not edited: one card with
 * the model's name, a plain input for each operation's literal ("non dynamic") value, and that
 * operation's live output — no sheet, no column/range pickers, no rename/edit/delete. Unlike the
 * editing page (OperationPanel), which calls one operation endpoint per entry as the model is
 * being built, this screen sends the whole model in a single call to
 * POST /api/v1/dataset/{datasetId}/model/calculate — the API resolves the chain between
 * operations itself and returns every result together.
 */
export function ModelCard({ dataset, modelName, entries }: ModelCardProps) {
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.fields])),
  );
  // Each operation's latest computed result/error, keyed by entry id — both come from the same
  // batched response. `results` (string form) also feeds resolveOperationInputs so a chained
  // field's pill can show "A aguardar…"/"Valor atual: …" the same way the editor does.
  const [results, setResults] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isCalculating, setIsCalculating] = useState(true);

  const liveEntries = entries.map((entry) => ({ id: entry.id, confirmed: entry.confirmed, fields: fields[entry.id] }));
  const resolvedInputs = resolveOperationInputs(liveEntries, results);

  useEffect(() => {
    let cancelled = false;
    setIsCalculating(true);

    const timeoutId = window.setTimeout(() => {
      calculateModel(
        dataset.datasetId,
        entries.map((entry) => ({ id: entry.id, kind: entry.kindId, fields: fields[entry.id] })),
      )
        .then((response) => {
          if (cancelled) return;
          const nextResults: Record<string, string | null> = {};
          const nextErrors: Record<string, string | null> = {};
          for (const result of response.results) {
            nextResults[result.id] = result.success && result.value != null ? String(result.value) : null;
            nextErrors[result.id] = result.success ? null : result.error;
          }
          setResults(nextResults);
          setErrors(nextErrors);
          setIsCalculating(false);
        })
        .catch((error) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : 'Falha ao calcular o modelo.';
          setResults({});
          setErrors(Object.fromEntries(entries.map((entry) => [entry.id, message])));
          setIsCalculating(false);
        });
    }, CALCULATE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
    // entries is fixed for the lifetime of this screen (it's the model as imported/built) — only
    // the literal values in `fields` actually change here, same debounce approach as the
    // editor's own per-field fetches (see lookupKind's LookupResult).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.datasetId, fields]);

  function updateEntryFields(id: string, patch: OperationFields) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  return (
    <div className="model-card">
      <h2 className="model-card__title">{modelName || 'Modelo sem nome'}</h2>

      <div className="model-card__operations">
        {entries.map((entry) => {
          const kind = KINDS_BY_ID[entry.kindId];
          return (
            <div key={entry.id} className="model-card__operation">
              <h3 className="model-card__operation-name">{entry.name || 'Operação sem nome'}</h3>
              {kind.renderInputEditor?.({
                fields: fields[entry.id],
                updateFields: (patch) => updateEntryFields(entry.id, patch),
                resolvedInput: resolvedInputs[entry.id],
              })}
              <ModelOperationResultView
                isCalculating={isCalculating}
                value={results[entry.id] ?? null}
                error={errors[entry.id] ?? null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ModelOperationResultViewProps {
  isCalculating: boolean;
  value: string | null;
  error: string | null;
}

function ModelOperationResultView({ isCalculating, value, error }: ModelOperationResultViewProps) {
  if (isCalculating) {
    return <p className="operation-entry__result operation-entry__result--empty">A calcular…</p>;
  }

  if (error) {
    return <p className="operation-entry__result operation-entry__result--empty">{error}</p>;
  }

  if (value === null) {
    return <p className="operation-entry__result operation-entry__result--empty">Sem correspondência encontrada.</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Resultado:</span> {formatCellValue(value) || '(vazio)'}
    </p>
  );
}
