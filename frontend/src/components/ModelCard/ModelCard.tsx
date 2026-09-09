import { useRef, useState } from 'react';
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
  /** The one operation the caller fills in, and the one whose result they see — picked by the
   * model's author in the editor (see OperationPanel's ModelIOPanel). Every other operation in
   * `entries` is still computed (a caller-facing output can chain through several internal
   * operations), just never shown here. */
  inputOperationId: string | null;
  outputOperationId: string | null;
}

/**
 * A model previously built in the editor and re-imported to be used, not edited: the model's
 * name, one editable field for its designated input, and one live result for its designated
 * output — every other operation in the model still runs (it may be an internal step the output
 * chains through), it's just not shown or editable here. Unlike the editing page (OperationPanel),
 * which calls one operation endpoint per entry as the model is being built, this screen sends the
 * whole model in a single call to POST /api/v1/dataset/{datasetId}/model/calculate — the API
 * resolves the chain between operations itself and returns every result together. Only runs when
 * "Correr modelo" is clicked — not on page load, and not on every keystroke in the input field —
 * so editing the input doesn't fire a request per character.
 */
export function ModelCard({ dataset, modelName, entries, inputOperationId, outputOperationId }: ModelCardProps) {
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.fields])),
  );
  // Every operation's latest computed result/error, keyed by entry id — both come from the same
  // batched response, even though only the output entry's is ever displayed; the others still
  // feed resolveOperationInputs so the input pill's chain status (if it's ever a reference) is
  // computed the same way the editor does.
  const [results, setResults] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  // Distinguishes "never run" (nothing to show yet) from "ran and genuinely found nothing" —
  // both look like a null result otherwise.
  const [hasRun, setHasRun] = useState(false);
  // Ignores a stale response from an earlier click that resolves after a later one, if the user
  // clicks "Correr modelo" again before the first request finishes.
  const runIdRef = useRef(0);

  const liveEntries = entries.map((entry) => ({ id: entry.id, confirmed: entry.confirmed, fields: fields[entry.id] }));
  const resolvedInputs = resolveOperationInputs(liveEntries, results);

  function runModel() {
    const runId = ++runIdRef.current;
    setIsCalculating(true);

    calculateModel(
      dataset.datasetId,
      entries.map((entry) => ({ id: entry.id, kind: entry.kindId, fields: fields[entry.id] })),
    )
      .then((response) => {
        if (runId !== runIdRef.current) return;
        const nextResults: Record<string, string | null> = {};
        const nextErrors: Record<string, string | null> = {};
        for (const result of response.results) {
          nextResults[result.id] = result.success && result.value != null ? String(result.value) : null;
          nextErrors[result.id] = result.success ? null : result.error;
        }
        setResults(nextResults);
        setErrors(nextErrors);
        setIsCalculating(false);
        setHasRun(true);
      })
      .catch((error) => {
        if (runId !== runIdRef.current) return;
        const message = error instanceof Error ? error.message : 'Falha ao calcular o modelo.';
        setResults({});
        setErrors(Object.fromEntries(entries.map((entry) => [entry.id, message])));
        setIsCalculating(false);
        setHasRun(true);
      });
  }

  function updateEntryFields(id: string, patch: OperationFields) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  // Null is a legitimate, permanent state for the input (not just "not set up yet") — a model
  // built with no operation eligible to be one (e.g. only a sum, which has no literal chainable
  // field at all) is a fixed model with nothing dynamic for a caller to fill in. The output has
  // no such case: some confirmed operation's result is always what the model computes, so a
  // missing one really does mean the model isn't finished.
  const inputEntry = entries.find((entry) => entry.id === inputOperationId) ?? null;
  const outputEntry = entries.find((entry) => entry.id === outputOperationId) ?? null;

  if (!outputEntry) {
    return (
      <div className="model-card">
        <h2 className="model-card__title">{modelName || 'Modelo sem nome'}</h2>
        <p className="model-card__missing-io">
          Este modelo ainda não tem um output definido. Edite o modelo e escolha-o antes de o utilizar.
        </p>
      </div>
    );
  }

  const inputKind = inputEntry ? KINDS_BY_ID[inputEntry.kindId] : null;

  return (
    <div className="model-card">
      <h2 className="model-card__title">{modelName || 'Modelo sem nome'}</h2>

      <div className="model-card__io">
        {inputEntry && inputKind && (
          <div className="model-card__field">
            <h3 className="model-card__field-name">{inputEntry.name || 'Input'}</h3>
            {inputKind.renderInputEditor?.({
              fields: fields[inputEntry.id],
              updateFields: (patch) => updateEntryFields(inputEntry.id, patch),
              resolvedInput: resolvedInputs[inputEntry.id],
            })}
          </div>
        )}

        <div className="model-card__field">
          <h3 className="model-card__field-name">{outputEntry.name || 'Output'}</h3>
          <ModelOperationResultView
            hasRun={hasRun}
            isCalculating={isCalculating}
            value={results[outputEntry.id] ?? null}
            error={errors[outputEntry.id] ?? null}
          />
        </div>
      </div>

      <button type="button" className="model-card__run-button" onClick={runModel} disabled={isCalculating}>
        {isCalculating ? 'A calcular…' : 'Correr modelo'}
      </button>
    </div>
  );
}

interface ModelOperationResultViewProps {
  hasRun: boolean;
  isCalculating: boolean;
  value: string | null;
  error: string | null;
}

function ModelOperationResultView({ hasRun, isCalculating, value, error }: ModelOperationResultViewProps) {
  if (isCalculating) {
    return <p className="operation-entry__result operation-entry__result--empty">A calcular…</p>;
  }

  if (!hasRun) {
    return <p className="operation-entry__result operation-entry__result--empty">Prima "Correr modelo" para ver o resultado.</p>;
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
