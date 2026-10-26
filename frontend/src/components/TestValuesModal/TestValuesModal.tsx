import { Modal } from '../Modal/Modal';
import { LoadingOverlay } from '../LoadingOverlay/LoadingOverlay';
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
  /** True while "Correr teste" is in its loading delay (see OperationPanel's runTestFromModal) —
   * shows the full-screen loading overlay and locks the form until the run actually starts. */
  isRunning: boolean;
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
export function TestValuesModal({ open, onClose, inputs, onChangeValue, onRun, isRunning, warning, importError }: TestValuesModalProps) {
  if (!open) return null;

  // "Correr teste" stays disabled until every field actually has something in it — this is a
  // proactive check on top of runModelTest's own (which still runs on click regardless, and
  // covers the broader case of an *unrelated* operation elsewhere in the chain being blank; see
  // its own note) — catching the common case, a field in this very form left empty, before the
  // click even happens instead of only after.
  const allFilled = inputs.every((input) => input.value.trim() !== '');

  return (
    <>
      {isRunning && <LoadingOverlay />}
      <Modal
        title="Testar modelo"
        onClose={onClose}
        closeDisabled={isRunning}
        actions={
          <>
            <button type="button" className="modal__button modal__button--ghost" onClick={onClose} disabled={isRunning}>
              Cancelar
            </button>
            <button
              type="button"
              className="modal__button action-button"
              onClick={onRun}
              disabled={!allFilled || isRunning}
              aria-busy={isRunning}
              title={allFilled ? undefined : 'Preencha todos os inputs antes de correr o teste.'}
            >
              Correr teste
            </button>
          </>
        }
      >
        <p className="modal__hint">Reveja o valor de cada input antes de correr o teste.</p>

        <div className="test-values-modal__fields">
          {inputs.map((input) => (
            <label key={input.id} className="test-values-modal__field">
              <span className="modal__label">{input.name || 'Input'}</span>
              <input
                type="text"
                className="modal__input"
                value={input.value}
                onChange={(event) => onChangeValue(input.id, event.target.value)}
                disabled={isRunning}
                placeholder="Introduza um valor"
              />
            </label>
          ))}
        </div>

        {warning && <p className="modal__hint modal__hint--error">{warning}</p>}
        {importError && <p className="modal__hint modal__hint--error">{importError}</p>}
      </Modal>
    </>
  );
}
