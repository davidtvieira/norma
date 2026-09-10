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

/** Alphabetical, with embedded numbers compared numerically (so "Input 2" sorts before
 * "Input 10") — the model author's own input/output toggle order (inputOperationIds/
 * outputOperationIds) isn't a meaningful reading order for whoever is utilizing the model. */
function sortByName(entries: SerializableEntry[]): SerializableEntry[] {
  return [...entries].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
}

interface ModelCardProps {
  dataset: DatasetImportResponse;
  modelName: string;
  entries: SerializableEntry[];
  /** The operations the caller fills in, and the operations whose results they see — both
   * possibly several, picked by the model's author in the editor (see OperationPanel's
   * model-input/model-output toggles). Every other operation in `entries` is still computed (a
   * caller-facing output can chain through several internal operations), just never shown here. */
  inputOperationIds: string[];
  outputOperationIds: string[];
  /** Returns to the screen this model was reached from (see App.tsx) — rendered here, next to
   * "Correr modelo", rather than as a separate element outside this component. */
  onBack: () => void;
}

/**
 * A model previously built in the editor and re-imported to be used, not edited: the model's
 * name, one editable field per designated input (there can be more than one), and one live result
 * per designated output (there can be more than one of these too) — every other operation in the
 * model still runs (it may be an internal step an output chains through), it's just not shown or
 * editable here. Unlike the editing page (OperationPanel), which calls one operation endpoint per
 * entry as the model is being built, this screen registers the whole model once (POST
 * /api/v1/dataset/{datasetId}/model) and, from then on, only ever sends the input values a caller
 * types in — never the operations themselves, and never a per-character request — to POST
 * .../model/{modelId}/run, which resolves the chain between operations server-side and returns
 * one result per designated output. Only runs when "Correr modelo" is clicked, not on page load
 * and not on every keystroke in an input field.
 */
export function ModelCard({ dataset, modelName, entries, inputOperationIds, outputOperationIds, onBack }: ModelCardProps) {
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.fields])),
  );

  // Null while registration is still in flight (or hasn't started) — "Correr modelo" stays
  // disabled until there's a model id to run. entries/inputOperationIds/outputOperationIds are
  // fixed for the lifetime of this screen (the model as imported/built), so this only needs to
  // happen once, against the dataset — never resent as the caller edits an input field.
  const [modelId, setModelId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (outputOperationIds.length === 0) {
      return;
    }

    registerModel(
      dataset.datasetId,
      modelName,
      entries.map((entry) => ({ id: entry.id, kind: entry.kindId, fields: entry.fields })),
      inputOperationIds,
      outputOperationIds,
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

  // One result per designated output, in whatever order the run returned them (matched back up
  // to its own operation below by id, not position).
  const [results, setResults] = useState<ModelOperationResultPayload[] | null>(null);
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

    // Always a literal in practice — only a literal-input operation is eligible to be one of a
    // model's designated inputs (see App.tsx's modelInputOptions) — but ValueSource is a union,
    // so this still needs to narrow before reading .value.
    const inputValues = Object.fromEntries(
      inputOperationIds.map((id) => {
        const source = getInputSource(fields[id]);
        return [id, source.type === 'literal' ? source.value : ''];
      }),
    );

    runModel(dataset.datasetId, modelId, inputValues)
      .then((response) => {
        if (runId !== runIdRef.current) return;
        setResults(response);
        setRunError(null);
        setIsRunning(false);
        setHasRun(true);
      })
      .catch((error) => {
        if (runId !== runIdRef.current) return;
        setResults(null);
        setRunError(error instanceof Error ? error.message : 'Falha ao correr o modelo.');
        setIsRunning(false);
        setHasRun(true);
      });
  }

  function updateEntryFields(id: string, patch: OperationFields) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  // Both an empty inputOperationIds and (validated at registration, never actually empty once a
  // model can be exported at all) outputOperationIds are legitimate, permanent states — a model
  // built with no operation eligible to be an input (e.g. only a sum, which has no literal
  // chainable field at all) is a fixed model with nothing dynamic for a caller to fill in.
  const inputEntries = sortByName(
    inputOperationIds
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is SerializableEntry => entry !== undefined),
  );
  const outputEntries = sortByName(
    outputOperationIds
      .map((id) => entries.find((entry) => entry.id === id))
      .filter((entry): entry is SerializableEntry => entry !== undefined),
  );

  if (outputEntries.length === 0) {
    return (
      <div className="model-card model-card--empty">
        <p className="model-card__missing-io">
          Este modelo ainda não tem um output definido. Edite o modelo e escolha-o antes de o utilizar.
        </p>
        <div className="model-card__actions">
          <button type="button" className="app__create-model-button app__create-model-button--back" onClick={onBack}>
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="model-card">
      <div className="model-card__io">
        {inputEntries.length > 0 && (
          <div className="model-card__io-panel">
            <div className="model-card__io-panel-content">
              <h3 className="model-card__io-panel-title">Input</h3>
              {inputEntries.map((inputEntry) => {
                const inputKind = KINDS_BY_ID[inputEntry.kindId];
                if (!inputKind.renderInputEditor) return null;
                return (
                  <div key={inputEntry.id} className="model-card__field">
                    <h3 className="model-card__field-name">{inputEntry.name || 'Input'}</h3>
                    {inputKind.renderInputEditor({
                      fields: fields[inputEntry.id],
                      updateFields: (patch) => updateEntryFields(inputEntry.id, patch),
                      resolvedInput: resolvedInputs[inputEntry.id][0],
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="model-card__io-panel">
          <div className="model-card__io-panel-content">
            <h3 className="model-card__io-panel-title">Output</h3>
            {outputEntries.map((outputEntry) => {
              const outputResult = results?.find((candidate) => candidate.id === outputEntry.id) ?? null;
              return (
                <div key={outputEntry.id} className="model-card__field">
                  <h3 className="model-card__field-name">{outputEntry.name || 'Output'}</h3>
                  <ModelOperationResultView
                    hasRun={hasRun}
                    isCalculating={isRunning}
                    value={outputResult && outputResult.success && outputResult.value != null ? String(outputResult.value) : null}
                    error={runError ?? (outputResult && !outputResult.success ? outputResult.error : null)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="model-card__actions">
        {registerError && <p className="model-card__missing-io">{registerError}</p>}
        <div className="model-card__actions-row">
          <button type="button" className="app__create-model-button app__create-model-button--back" onClick={onBack}>
            ← Voltar
          </button>
          <button type="button" className="model-card__run-button" onClick={run} disabled={isRunning || !modelId}>
            {isRunning ? 'A calcular…' : 'Correr modelo'}
          </button>
        </div>
      </div>
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
