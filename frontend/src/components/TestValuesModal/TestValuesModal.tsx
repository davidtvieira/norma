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
}

/**
 * Opened by "Testar modelo" once the model has at least one designated input — one field per
 * input, already filled with whatever's currently set for it (typed directly on its own node on
 * the canvas, or loaded via the toolbar's "Importar teste"), so this is a review-and-adjust step
 * rather than always starting blank. Typing here writes straight through to that same node's own
 * field (see OperationPanel's onChangeValue), same as typing on the canvas itself would — nothing
 * here duplicates where a value actually lives. "Importar teste"/"Guardar teste" live in the
 * toolbar/next to "Guardar modelo" now, not in this modal, so it's just the fields plus the one
 * action that actually runs something.
 */
export function TestValuesModal({ open, onClose, inputs, onChangeValue, onRun }: TestValuesModalProps) {
  if (!open) return null;

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

        <div className="test-values-modal__actions">
          <button type="button" className="test-values-modal__button test-values-modal__button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="test-values-modal__button test-values-modal__run-button" onClick={onRun}>
            Correr teste
          </button>
        </div>
      </div>
    </div>
  );
}
