import { useEffect, useRef, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { OperationFields } from '../OperationPanel/operationKind';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource } from '../../types/valueSource';
import type { SerializableEntry } from '../../utils/modelSerialization';
import { registerModel, runModel } from '../../services/datasetApi';
import type { ModelOperationResultPayload } from '../../types/modelCalculation';
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
 * which calls one operation endpoint per entry as the model is being built, this screen registers
 * the whole model once (POST /api/v1/dataset/{datasetId}/model) and, from then on, only ever
 * sends the one input value a caller types in — never the operations themselves, and never a
 * per-character request — to POST .../model/{modelId}/run, which resolves the chain between
 * operations server-side and returns only the designated output's result. Only runs when "Correr
 * modelo" is clicked, not on page load and not on every keystroke in the input field.
 */
export function ModelCard({ dataset, modelName, entries, inputOperationId, outputOperationId }: ModelCardProps) {
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.fields])),
  );

  // Null while registration is still in flight (or hasn't started) — "Correr modelo" stays
  // disabled until there's a model id to run. entries/inputOperationId/outputOperationId are
  // fixed for the lifetime of this screen (the model as imported/built), so this only needs to
  // happen once, against the dataset — never resent as the caller edits the input field.
  const [modelId, setModelId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!outputOperationId) {
      return;
    }

    registerModel(
      dataset.datasetId,
      modelName,
      entries.map((entry) => ({ id: entry.id, kind: entry.kindId, fields: entry.fields })),
      inputOperationId,
      outputOperationId,
    )
      .then((response) => {
        if (!cancelled) setModelId(response.modelId);
      })
      .catch((error) => {
        if (!cancelled) {
          setRegisterError(error instanceof Error ? error.message : 'Falha ao preparar o modelo.');
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.datasetId]);

  const [result, setResult] = useState<ModelOperationResultPayload | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // Distinguishes "never run" (nothing to show yet) from "ran and genuinely found nothing" —
  // both look like a null result otherwise.
  const [hasRun, setHasRun] = useState(false);
  // Ignores a stale response from an earlier click that resolves after a later one, if the user
  // clicks "Correr modelo" again before the first request finishes.
  const runIdRef = useRef(0);

  // The output's status only ever comes from a run's own response now — a run returns just the
  // designated output, not every operation's result — so there's nothing meaningful to resolve
  // reference chain status against here; the input field itself is always a literal (see the
  // eligibility rule in App.tsx), which resolveOperationInputs already reports as immediately
  // "ready" regardless of what's passed as `results`.
  const liveEntries = entries.map((entry) => ({ id: entry.id, confirmed: entry.confirmed, fields: fields[entry.id] }));
  const resolvedInputs = resolveOperationInputs(liveEntries, {});

  function run() {
    if (!modelId) return;
    const runId = ++runIdRef.current;
    setIsRunning(true);

    // Always a literal in practice — only a literal-input operation is eligible to be a model's
    // designated input (see App.tsx's modelInputOptions) — but ValueSource is a union, so this
    // still needs to narrow before reading .value.
    const source = inputOperationId ? getInputSource(fields[inputOperationId]) : null;
    const inputValue = source && source.type === 'literal' ? source.value : null;

    runModel(dataset.datasetId, modelId, inputValue)
      .then((response) => {
        if (runId !== runIdRef.current) return;
        setResult(response);
        setRunError(null);
        setIsRunning(false);
        setHasRun(true);
      })
      .catch((error) => {
        if (runId !== runIdRef.current) return;
        setResult(null);
        setRunError(error instanceof Error ? error.message : 'Falha ao correr o modelo.');
        setIsRunning(false);
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
              resolvedInput: resolvedInputs[inputEntry.id][0],
            })}
          </div>
        )}

        <div className="model-card__field">
          <h3 className="model-card__field-name">{outputEntry.name || 'Output'}</h3>
          <ModelOperationResultView
            hasRun={hasRun}
            isCalculating={isRunning}
            value={result && result.success && result.value != null ? String(result.value) : null}
            error={runError ?? (result && !result.success ? result.error : null)}
          />
        </div>
      </div>

      {registerError ? (
        <p className="model-card__missing-io">{registerError}</p>
      ) : (
        <button type="button" className="model-card__run-button" onClick={run} disabled={isRunning || !modelId}>
          {isRunning ? 'A calcular…' : 'Correr modelo'}
        </button>
      )}
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
