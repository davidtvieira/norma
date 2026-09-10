import './SaveModal.css';

interface SaveModalProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  canExport: boolean;
  /** What's still missing before canExport is true — null once it is. An input is only ever
   * something to fix here if the model actually has an operation eligible to be one (see
   * App.tsx's isModelInputRequired); a model with none (e.g. built only from a sum) is a fixed
   * model with nothing dynamic for a caller to fill in, and never blocks on it. */
  exportHint: string | null;
  /** Names of the model's designated input/output operations, one per line (see IoGroup) — a
   * model can have several of each (App.tsx's modelInputIds/modelOutputIds) — null while not yet
   * set. Read-only here: both are now picked directly on the operation's node (see OperationPanel's
   * "Input"/"Output" toggles), not in this modal. */
  inputLabels: string[] | null;
  outputLabels: string[] | null;
}

/**
 * Reachable from the "Guardar modelo" button. Saving the model to the backend isn't wired up
 * yet, but exporting it as a JSON file (see utils/modelSerialization.ts) already is — the same
 * file can later be re-imported via "Importar Modelo para este conjunto de dados".
 */
export function SaveModal({ open, onClose, onExport, canExport, exportHint, inputLabels, outputLabels }: SaveModalProps) {
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
          <IoGroup label="Input" values={inputLabels} />
          <IoGroup label="Output" values={outputLabels} />
        </div>

        {exportHint && <p className="save-modal__hint">{exportHint}</p>}
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

interface IoGroupProps {
  label: string;
  values: string[] | null;
}

/** One "Input"/"Output" group — its label once, then every designated operation's name on its
 * own line below (rather than one long comma-joined line) so a model with several of either
 * stays readable instead of running together. */
function IoGroup({ label, values }: IoGroupProps) {
  return (
    <div className="save-modal__io-group">
      <span className="save-modal__io-label">{label}</span>
      {!values || values.length === 0 ? (
        <p className="save-modal__io-item save-modal__io-item--muted">por definir</p>
      ) : (
        values.map((value) => (
          <p key={value} className="save-modal__io-item">
            {value}
          </p>
        ))
      )}
    </div>
  );
}
