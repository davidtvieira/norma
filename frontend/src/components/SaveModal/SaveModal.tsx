import './SaveModal.css';

export interface ModelIOOption {
  id: string;
  label: string;
}

interface SaveModalProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  canExport: boolean;
  inputOptions: ModelIOOption[];
  outputOptions: ModelIOOption[];
  inputOperationId: string | null;
  outputOperationId: string | null;
  onInputChange: (id: string | null) => void;
  onOutputChange: (id: string | null) => void;
}

/**
 * Reachable from the "Guardar modelo" button. Saving the model to the backend isn't wired up
 * yet, but exporting it as a JSON file (see utils/modelSerialization.ts) already is — the same
 * file can later be re-imported via "Importar Modelo para este conjunto de dados".
 *
 * Also where the model's input/output are picked: which operation receives the value a caller
 * of the model fills in, and which one's result they see (see ModelCard) — asked for here, at
 * save time, rather than while still building the model, so it doesn't compete for attention
 * with actually building the operations.
 */
export function SaveModal({
  open,
  onClose,
  onExport,
  canExport,
  inputOptions,
  outputOptions,
  inputOperationId,
  outputOperationId,
  onInputChange,
  onOutputChange,
}: SaveModalProps) {
  if (!open) return null;

  return (
    <div className="save-modal__overlay" onClick={onClose}>
      <div className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="save-modal-title" className="save-modal__title">
          Guardar modelo
        </h2>
        <p className="save-modal__body">
          Ainda não é possível guardar o modelo diretamente na plataforma. Pode, no entanto, exportá-lo como ficheiro JSON e
          voltar a importá-lo mais tarde.
        </p>

        <div className="save-modal__io">
          <p className="save-modal__io-hint">
            Escolha qual operação recebe o valor de quem utilizar o modelo, e qual mostra o resultado final.
          </p>

          <div className="operation-entry__field">
            <label className="operation-entry__label" htmlFor="model-input-select">
              Input do modelo
            </label>
            <select
              id="model-input-select"
              className="operation-entry__select"
              value={inputOperationId ?? ''}
              onChange={(event) => onInputChange(event.target.value || null)}
              disabled={inputOptions.length === 0}
            >
              <option value="">{inputOptions.length === 0 ? 'Sem operações elegíveis' : 'Selecione uma operação'}</option>
              {inputOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="operation-entry__field">
            <label className="operation-entry__label" htmlFor="model-output-select">
              Output do modelo
            </label>
            <select
              id="model-output-select"
              className="operation-entry__select"
              value={outputOperationId ?? ''}
              onChange={(event) => onOutputChange(event.target.value || null)}
              disabled={outputOptions.length === 0}
            >
              <option value="">{outputOptions.length === 0 ? 'Sem operações elegíveis' : 'Selecione uma operação'}</option>
              {outputOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!canExport && (
          <p className="save-modal__hint">
            Conclua pelo menos uma operação e defina o input e o output do modelo antes de exportar.
          </p>
        )}
        <div className="save-modal__actions">
          <button type="button" className="save-modal__close-button save-modal__close-button--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="save-modal__close-button"
            onClick={() => {
              onExport();
              onClose();
            }}
            disabled={!canExport}
          >
            Exportar modelo (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}
