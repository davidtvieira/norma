import { useRef } from 'react';
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
  onSave: () => void;
  onLoad: (file: File) => void;
  /** Set by OperationPanel if the last "Carregar teste" failed to parse — cleared on the next
   * successful load, or when this modal is reopened (see OperationPanel's onOpen). */
  loadError: string | null;
}

/**
 * Opened by "Testar modelo" once the model has at least one designated input (see
 * OperationPanel) — one field per input, instead of needing to type test values directly into
 * each input node's own field on the canvas first. Typing here writes straight through to that
 * same node's own field (see OperationPanel's onChangeValue), so "Correr teste" is just the usual
 * testSignal bump — nothing here duplicates where a value actually lives.
 *
 * "Guardar teste" downloads the current values as a JSON file; "Carregar teste" loads one back
 * in — see utils/testCaseSerialization.ts for why that file is keyed by each input's *name*
 * rather than its internal id.
 */
export function TestValuesModal({ open, onClose, inputs, onChangeValue, onRun, onSave, onLoad, loadError }: TestValuesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        <p className="test-values-modal__body">Introduza um valor para cada input antes de correr o teste.</p>

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

        {loadError && <p className="test-values-modal__hint">{loadError}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="test-values-modal__file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ''; // so re-loading the same file path fires onChange again
            if (file) onLoad(file);
          }}
        />

        <div className="test-values-modal__actions">
          <div className="test-values-modal__actions-row">
            <button
              type="button"
              className="test-values-modal__button test-values-modal__button--secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Carregar teste (JSON)
            </button>
            <button type="button" className="test-values-modal__button test-values-modal__button--secondary" onClick={onSave}>
              Guardar teste (JSON)
            </button>
          </div>
          <button type="button" className="test-values-modal__button test-values-modal__run-button" onClick={onRun}>
            Correr teste
          </button>
        </div>
      </div>
    </div>
  );
}
