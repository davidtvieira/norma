import './TestValuesModal.css';

export interface TestValueEntry {
  id: string;
  name: string;
  value: string;
}

interface TestValuesModalProps {
  open: boolean;
  onClose: () => void;
  inputs: TestValueEntry[];
  onChangeValue: (id: string, value: string) => void;
  onRun: () => void;
  /** Set when the last "Correr teste" click was blocked because one of the inputs above is still
   * empty (see OperationPanel's runModelTest) — shown right here rather than elsewhere on the
   * canvas, which this overlay covers entirely while open. Null clears it. */
  warning: string | null;
  /** Set when the canvas toolbar's own "Importar teste" (see OperationPanel's triggerImportTest)
   * fails to parse a file — shown here for the same reason as `warning`: this overlay covers
   * whatever's underneath while open, so an error from an import that happened just before this
   * modal opened still needs somewhere to surface. Null clears it. */
  importError: string | null;
}

/**
 * Opened by "Testar modelo" once the model has at least one designated input — one field per
 * input, already filled with whatever's currently set for it (typed directly on its own node on
 * the canvas, or loaded via the toolbar's "Importar teste"), so this is a review-and-adjust step
 * rather than always starting blank. Typing here writes straight through
 * to that same node's own field (see OperationPanel's onChangeValue), same as typing on the
 * canvas itself would — nothing here duplicates where a value actually lives. "Guardar teste"
 * still lives next to "Guardar modelo" rather than in here — nothing to export mid-review that
 * isn't already just as reachable from there. "Importar teste"/"Limpar teste" likewise aren't in
 * here — that's the canvas toolbar's own toggle (see OperationPanel), reachable without needing
 * this modal open at all.
 */
export function TestValuesModal({ open, onClose, inputs, onChangeValue, onRun, warning, importError }: TestValuesModalProps) {
  if (!open) return null;

  // "Correr teste" stays disabled until every field actually has something in it — this is a
  // proactive check on top of runModelTest's own (which still runs on click regardless, and
  // covers the broader case of an *unrelated* operation elsewhere in the chain being blank; see
  // its own note) — catching the common case, a field in this very form left empty, before the
  // click even happens instead of only after.
  const allFilled = inputs.every((input) => input.value.trim() !== '');

  return (
    <div className="test-values-modal__overlay" onClick={onClose}>
      <div
        className="test-values-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-values-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="test-values-modal-title" className="test-values-modal__title">
          Testar modelo
        </h2>
        <p className="test-values-modal__body">Reveja o valor de cada input antes de correr o teste.</p>

        <div className="test-values-modal__fields">
          {inputs.map((input) => (
            <div key={input.id} className="test-values-modal__field">
              <label className="test-values-modal__label">{input.name || 'Input'}</label>
              <input
                type="text"
                className="test-values-modal__input"
                value={input.value}
                onChange={(event) => onChangeValue(input.id, event.target.value)}
                placeholder="Introduza um valor"
              />
            </div>
          ))}
        </div>

        {warning && <p className="test-values-modal__hint">{warning}</p>}
        {importError && <p className="test-values-modal__hint">{importError}</p>}

        <div className="test-values-modal__actions">
          <button type="button" className="test-values-modal__button test-values-modal__button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="test-values-modal__button test-values-modal__run-button"
            onClick={onRun}
            disabled={!allFilled}
            title={allFilled ? undefined : 'Preencha todos os inputs antes de correr o teste.'}
          >
            Correr teste
          </button>
        </div>
      </div>
    </div>
  );
}
