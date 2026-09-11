import { useEffect, useRef, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { OperationFields } from '../OperationPanel/operationKind';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, literalSource } from '../../types/valueSource';
import type { SerializableEntry } from '../../utils/modelSerialization';
import { registerModel, runModel } from '../../services/datasetApi';
import type { ModelOperationResultPayload } from '../../types/modelCalculation';
import { downloadTestCase, parseTestCaseFile } from '../../utils/testCaseSerialization';
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

  // Which field's full (untruncated) name + value is currently shown in the view-full-text modal
  // (see EyeButton/FullTextModal below) — at most one at a time, same pattern as OperationPanel's
  // own modalEntryId. Null means the modal is closed.
  const [viewFullText, setViewFullText] = useState<{ name: string; value: string } | null>(null);

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
  const testFileInputRef = useRef<HTMLInputElement>(null);

  // The output's status only ever comes from a run's own response now — a run returns just the
  // designated output, not every operation's result — so there's nothing meaningful to resolve
  // reference chain status against here; the input field itself is always a literal (see the
  // eligibility rule in App.tsx), which resolveOperationInputs already reports as immediately
  // "ready" regardless of what's passed as `results`.
  const liveEntries = entries.map((entry) => ({ id: entry.id, confirmed: entry.confirmed, fields: fields[entry.id] }));
  const resolvedInputs = resolveOperationInputs(liveEntries, {});

  // Every designated input is always a literal (see App.tsx's modelInputOptions) — "filled" just
  // means that literal isn't blank. Run stays disabled until every one of them has something
  // typed in, not just until the model has finished registering.
  const allInputsFilled = inputOperationIds.every((id) => {
    const source = getInputSource(fields[id]);
    return source.type === 'literal' && source.value.trim() !== '';
  });

  // Shared by run() (whatever's currently in `fields`) and loadTestCase (values just loaded from
  // a file, sent straight through instead of round-tripping via `fields` state first — reading
  // `fields` back out synchronously right after a setFields call would still see the *old*
  // values, since the update hasn't committed yet).
  function runWithInputValues(inputValues: Record<string, string>) {
    if (!modelId) return;
    const runId = ++runIdRef.current;
    setIsRunning(true);

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

  function run() {
    // Always a literal in practice — only a literal-input operation is eligible to be one of a
    // model's designated inputs (see App.tsx's modelInputOptions) — but ValueSource is a union,
    // so this still needs to narrow before reading .value.
    const inputValues = Object.fromEntries(
      inputOperationIds.map((id) => {
        const source = getInputSource(fields[id]);
        return [id, source.type === 'literal' ? source.value : ''];
      }),
    );
    runWithInputValues(inputValues);
  }

  function updateEntryFields(id: string, patch: OperationFields) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  const [testLoadError, setTestLoadError] = useState<string | null>(null);

  function saveTestCase() {
    downloadTestCase(
      modelName,
      inputEntries.map((entry) => {
        const source = getInputSource(fields[entry.id]);
        return { name: entry.name, value: source.type === 'literal' ? source.value : '' };
      }),
    );
  }

  // Matches each saved value against a currently-present input by exact name (ids regenerate on
  // every import — see OperationPanel's testCaseSerialization notes), writing them into `fields`
  // so the input boxes reflect what was loaded. Only fills the fields, same as typing the values
  // in by hand — it does NOT run the model itself; "Correr modelo" is still a separate, explicit
  // step, so a loaded test can be reviewed (and, if needed, adjusted) before it actually runs.
  function loadTestCase(file: File) {
    parseTestCaseFile(file)
      .then((parsed) => {
        setTestLoadError(null);
        const valueByName = new Map(parsed.inputs.map((input) => [input.name, input.value]));
        const nextFields = { ...fields };
        for (const entry of inputEntries) {
          const loadedValue = valueByName.get(entry.name);
          if (loadedValue !== undefined) {
            nextFields[entry.id] = { ...nextFields[entry.id], input: literalSource(loadedValue) };
          }
        }
        setFields(nextFields);
      })
      .catch((error) => {
        setTestLoadError(error instanceof Error ? error.message : 'Falha ao carregar o teste.');
      });
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
              <div className="model-card__field-grid">
                {inputEntries.map((inputEntry) => {
                  const inputKind = KINDS_BY_ID[inputEntry.kindId];
                  if (!inputKind.renderInputEditor) return null;
                  const name = inputEntry.name || 'Input';
                  const source = getInputSource(fields[inputEntry.id]);
                  const currentValue = source.type === 'literal' ? source.value : '';
                  return (
                    <div key={inputEntry.id} className="model-card__field">
                      <EyeButton onView={() => setViewFullText({ name, value: currentValue })} />
                      <h3 className="model-card__field-name" title={name}>
                        {name}
                      </h3>
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
          </div>
        )}

        <div className="model-card__io-panel">
          <div className="model-card__io-panel-content">
            <h3 className="model-card__io-panel-title">Output</h3>
            <div className="model-card__field-grid">
              {outputEntries.map((outputEntry) => {
                const outputResult = results?.find((candidate) => candidate.id === outputEntry.id) ?? null;
                const name = outputEntry.name || 'Output';
                const value = outputResult && outputResult.success && outputResult.value != null ? String(outputResult.value) : null;
                const error = runError ?? (outputResult && !outputResult.success ? outputResult.error : null);
                return (
                  <div key={outputEntry.id} className="model-card__field">
                    <EyeButton onView={() => setViewFullText({ name, value: describeResult(hasRun, isRunning, value, error) })} />
                    <h3 className="model-card__field-name" title={name}>
                      {name}
                    </h3>
                    <ModelOperationResultView hasRun={hasRun} isCalculating={isRunning} value={value} error={error} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="model-card__actions">
        {registerError && <p className="model-card__missing-io">{registerError}</p>}
        {testLoadError && <p className="model-card__missing-io">{testLoadError}</p>}
        <div className="model-card__actions-row">
          <div className="model-card__actions-group">
            {inputEntries.length > 0 && (
              <>
                <input
                  ref={testFileInputRef}
                  type="file"
                  accept="application/json"
                  className="model-card__test-file-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = ''; // so re-loading the same file path fires onChange again
                    if (file) loadTestCase(file);
                  }}
                />
                <button
                  type="button"
                  className="app__create-model-button app__create-model-button--secondary"
                  onClick={() => testFileInputRef.current?.click()}
                >
                  Carregar teste (JSON)
                </button>
                <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={saveTestCase}>
                  Guardar teste (JSON)
                </button>
              </>
            )}
          </div>
          <div className="model-card__actions-group">
            <button type="button" className="app__create-model-button app__create-model-button--back" onClick={onBack}>
              ← Voltar
            </button>
            <button
              type="button"
              className="model-card__run-button"
              onClick={run}
              disabled={isRunning || !modelId || !allInputsFilled}
            >
              {isRunning ? 'A calcular…' : 'Correr modelo'}
            </button>
          </div>
        </div>
      </div>

      <FullTextModal field={viewFullText} onClose={() => setViewFullText(null)} />
    </div>
  );
}

interface EyeButtonProps {
  onView: () => void;
}

/** Top-right corner of every input/output card — opens FullTextModal with that card's own full
 * (untruncated) name + value, the same "eye" icon RevealButton (OperationPanel.tsx) already uses
 * elsewhere in the app for "see the full thing, not just what's shown here". */
function EyeButton({ onView }: EyeButtonProps) {
  return (
    <button type="button" className="model-card__field-view" onClick={onView} aria-label="Ver texto completo" title="Ver texto completo">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

interface FullTextModalProps {
  /** Null closes the modal — same "the value itself is the open/closed state" pattern as most of
   * this app's other single-item modals (e.g. OperationPanel's modalEntryId). */
  field: { name: string; value: string } | null;
  onClose: () => void;
}

/** The eye button's own modal — just the field's full name (as a heading, in case that's what's
 * actually truncated, not the value) and its full value below, wrapped rather than clipped. No
 * portal (unlike OperationPanel's own card modal): nothing on this screen sits inside a
 * transformed ancestor, so a plain fixed overlay already covers the real viewport correctly. */
function FullTextModal({ field, onClose }: FullTextModalProps) {
  if (!field) return null;

  return (
    <div className="model-card__view-modal-overlay" onClick={onClose}>
      <div
        className="model-card__view-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-card-view-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="model-card__view-modal-header">
          <h3 id="model-card-view-modal-title" className="model-card__view-modal-title">
            {field.name}
          </h3>
          <button type="button" className="model-card__view-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="model-card__view-modal-value">{field.value || '(vazio)'}</p>
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

/** The plain-text description of an output's current state — shared by ModelOperationResultView
 * below (which additionally prefixes the success case with a "Resultado:" label and styles the
 * not-yet-run/empty states as muted) and the eye button's own full-text modal, which just needs
 * the text itself, not that formatting. */
function describeResult(hasRun: boolean, isCalculating: boolean, value: string | null, error: string | null): string {
  if (isCalculating) return 'A calcular…';
  if (!hasRun) return 'Prima "Correr modelo" para ver o resultado.';
  if (error) return error;
  if (value === null) return 'Sem correspondência encontrada.';
  return formatCellValue(value) || '(vazio)';
}

function ModelOperationResultView({ hasRun, isCalculating, value, error }: ModelOperationResultViewProps) {
  if (isCalculating || !hasRun || error || value === null) {
    const text = describeResult(hasRun, isCalculating, value, error);
    return (
      <p className="operation-entry__result operation-entry__result--empty" title={text}>
        {text}
      </p>
    );
  }

  const displayValue = describeResult(hasRun, isCalculating, value, error);
  return (
    <p className="operation-entry__result" title={displayValue}>
      <span className="operation-entry__result-label">Resultado:</span> {displayValue}
    </p>
  );
}
