import { inlineErrorMessage } from '../../services/apiErrors';
import { useRef, useState } from 'react';
import type { DatasetHandle } from '../../types/dataset';
import type { OperationFields } from '../OperationPanel/operationKind';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, literalSource } from '../../types/valueSource';
import { runModel, runNrm } from '../../services/datasetApi';
import type { ModelInputFieldPayload, ModelOperationResultPayload } from '../../types/modelCalculation';
import { downloadTestCase, parseTestCaseFile } from '../../utils/testCaseSerialization';
import { formatCellValue } from '../../utils/sheet';
import './ModelCard.css';

/** Alphabetical, with embedded numbers compared numerically (so "Input 2" sorts before
 * "Input 10") — the model author's own input/output toggle order (inputOperationIds/
 * outputOperationIds) isn't a meaningful reading order for whoever is utilizing the model. */
function sortByName(entries: ModelInputFieldPayload[]): ModelInputFieldPayload[] {
  return [...entries].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
}

interface ModelCardProps {
  dataset: DatasetHandle;
  modelName: string;
  /** The model's id from registerModel, already registered by the time this screen is shown. */
  modelId: string;
  /** When set, the model is run through the imported .nrm's own id instead of dataset + modelId. */
  nrmId?: string;
  /** What the caller fills in — possibly several, picked by the model's author in the editor (see
   * OperationPanel's model-input/model-output toggles), as returned by GET
   * .../model/{modelId}/inputs. This screen never receives the model's operations or outputs
   * up front: the outputs (with their names) only arrive with a run's results. */
  inputs: ModelInputFieldPayload[];
  /** Returns to the screen this model was reached from (see App.tsx) — rendered here, next to
   * "Correr modelo", rather than as a separate element outside this component. */
  onBack: () => void;
}

/** The least time a run shows its loading state ("A calcular…") for, even when the response comes
 * back faster — so a click visibly registers instead of the result flashing in instantly. */
const RUN_MIN_DURATION_MS = 1000;

/** Resolves/rejects with `promise`'s own outcome, but not before `ms` have passed. */
async function withMinimumDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  const delay = new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  try {
    return await promise;
  } finally {
    await delay;
  }
}

/**
 * A model previously built in the editor and re-imported to be used, not edited: the model's
 * name, one editable field per designated input (there can be more than one), and one live result
 * per designated output (there can be more than one of these too) — every other operation in the
 * model still runs (it may be an internal step an output chains through), it's just not shown or
 * editable here. Unlike the editing page (OperationPanel), which calls one operation endpoint per
 * entry as the model is being built, this screen is handed an already-registered model's inputs
 * only (GET .../model/{modelId}/inputs, see App.tsx's prepareUtilize) and, from then on,
 * only ever sends the input values a caller types in — never the operations themselves, and never
 * a per-character request — to POST
 * .../model/{modelId}/run, which resolves the chain between operations server-side and returns
 * one result per designated output. Only runs when "Correr modelo" is clicked, not on page load
 * and not on every keystroke in an input field.
 */
export function ModelCard({ dataset, modelName, modelId, nrmId, inputs, onBack }: ModelCardProps) {
  const inputOperationIds = inputs.map((input) => input.id);
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(inputs.map((input) => [input.id, { input: literalSource(input.value ?? '') }])),
  );

  // Which field's full (untruncated) name + value is currently shown in the view-full-text modal
  // (see EyeButton/FullTextModal below) — at most one at a time, same pattern as OperationPanel's
  // own modalEntryId. Null means the modal is closed.
  const [viewFullText, setViewFullText] = useState<{ name: string; value: string } | null>(null);

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

  // Which of the two IO panels currently takes up most of the screen — the other collapses to a
  // small clickable square. Starts on "input" (nothing to show on the output side yet), and
  // a finished "Correr modelo" run swaps it to "output" so the result is what's immediately visible.
  // Purely a display toggle from then on: clicking either collapsed square swaps it back, without
  // triggering a run or touching any input value — only "Correr modelo" itself does that (see run()
  // below).
  const [expandedSide, setExpandedSide] = useState<'input' | 'output'>('input');

  // The output's status only ever comes from a run's own response now — a run returns just the
  // designated output, not every operation's result — so there's nothing meaningful to resolve
  // reference chain status against here; the input field itself is always a literal (see the
  // eligibility rule in App.tsx), which resolveOperationInputs already reports as immediately
  // "ready" regardless of what's passed as `results`.
  const liveEntries = inputs.map((input) => ({ id: input.id, confirmed: true, fields: fields[input.id] }));
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
    const runId = ++runIdRef.current;
    setIsRunning(true);

    withMinimumDelay(nrmId ? runNrm(nrmId, inputValues) : runModel(dataset.datasetId, modelId, inputValues), RUN_MIN_DURATION_MS)
      .then((response) => {
        if (runId !== runIdRef.current) return;
        setResults(response);
        setRunError(null);
        setIsRunning(false);
        setHasRun(true);
        // Only swaps to the output side once the run has finished — until then the input side
        // stays up, with the button showing "A calcular…", rather than showing an output panel
        // that's still loading.
        setExpandedSide('output');
      })
      .catch((error) => {
        if (runId !== runIdRef.current) return;
        setResults(null);
        setRunError(inlineErrorMessage(error, 'Falha ao correr o modelo.') || null);
        setIsRunning(false);
        setHasRun(true);
        setExpandedSide('output');
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
  const inputEntries = sortByName(inputs);
  // Outputs are only known once a run has returned them (each result carries its own name).
  const outputEntries = sortByName((results ?? []).map((result) => ({ id: result.id, name: result.name ?? '', kind: '', value: '' })));

  if (!modelId && !nrmId) {
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

  // With no designated input at all, there's nothing to toggle between — the output panel just
  // takes the full width on its own, same as before this expand/collapse behavior existed.
  const canToggleIo = inputEntries.length > 0;
  const inputExpanded = !canToggleIo || expandedSide === 'input';
  const outputExpanded = !canToggleIo || expandedSide === 'output';

  return (
    <div className="model-card">
      <div className="model-card__io">
        {inputEntries.length > 0 && (
          <div
            className={`model-card__io-column ${inputExpanded ? 'model-card__io-column--expanded' : 'model-card__io-column--collapsed'}`}
          >
            {inputExpanded && <h3 className="model-card__io-panel-title">Input ({inputEntries.length})</h3>}
            <div className={`model-card__io-panel ${inputExpanded ? '' : 'model-card__io-panel--collapsed'}`}>
              {inputExpanded ? (
                <div className="model-card__io-panel-content">
                  <div className="model-card__field-grid">
                    {inputEntries.map((inputEntry) => {
                      const inputKind = KINDS_BY_ID[inputEntry.kind];
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
              ) : (
                <button
                  type="button"
                  className="model-card__io-panel-collapsed"
                  onClick={() => setExpandedSide('input')}
                >
                  Inputs ({inputEntries.length})
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className={`model-card__io-column ${outputExpanded ? 'model-card__io-column--expanded' : 'model-card__io-column--collapsed'}`}
        >
          {outputExpanded && (
            <h3 className="model-card__io-panel-title">Output{hasRun ? ` (${outputEntries.length})` : ''}</h3>
          )}
          <div className={`model-card__io-panel ${outputExpanded ? '' : 'model-card__io-panel--collapsed'}`}>
            {outputExpanded ? (
              <div className="model-card__io-panel-content">
                <div className="model-card__field-grid">
                  {/* No result names to list yet — before the first run, or when the run itself failed. */}
                  {results === null && (
                    <div className="model-card__field">
                      <ModelOperationResultView hasRun={hasRun} isCalculating={isRunning} value={null} error={runError} />
                    </div>
                  )}
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
            ) : (
              <button
                type="button"
                className="model-card__io-panel-collapsed"
                onClick={() => setExpandedSide('output')}
                // Nothing to look at until a run has finished.
                disabled={!hasRun}
                title={hasRun ? undefined : 'Corra o modelo para ver o resultado.'}
              >
                Outputs ({outputEntries.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="model-card__actions">
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
              className="model-card__run-button action-button"
              onClick={run}
              disabled={isRunning || !allInputsFilled}
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
      <span className="operation-entry__result-label">Saída:</span> {displayValue}
    </p>
  );
}
