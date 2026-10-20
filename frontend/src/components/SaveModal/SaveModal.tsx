import { useState } from 'react';
import './SaveModal.css';

/** What "Guardar modelo" can export: the full .nrm bundle (model + dataset), or just the model .json. */
export type ModelExportFormat = 'nrm' | 'json';

interface SaveModalProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: ModelExportFormat) => void;
  nrmName: string;
  onNrmNameChange: (name: string) => void;
  /** Shown as the name field's placeholder — what the file is called if left blank. */
  nrmNamePlaceholder: string;
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
 * yet, but exporting it as a .nrm file (see utils/nrmSerialization.ts) already is — a zip
 * bundling the model JSON together with the dataset's own spreadsheet, so the one saved file is
 * also enough to reopen it later via "Importar Modelo" without the dataset having to be
 * re-imported separately first.
 */
export function SaveModal({ open, onClose, onExport, nrmName, onNrmNameChange, nrmNamePlaceholder, canExport, exportHint, inputLabels, outputLabels }: SaveModalProps) {
  if (!open) return null;

  return (
    <div className="save-modal__overlay" onClick={onClose}>
      <div className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="save-modal-title" className="save-modal__title">
          Guardar modelo
        </h2>
        <p className="save-modal__body">
          Ainda não é possível guardar o modelo diretamente na plataforma. Pode, no entanto, exportá-lo como ficheiro .nrm
          (inclui o conjunto de dados) e voltar a importá-lo mais tarde.
        </p>

        <label className="save-modal__name">
          <span className="save-modal__io-label">Nome do ficheiro (.nrm)</span>
          <input
            type="text"
            className="save-modal__name-input"
            value={nrmName}
            placeholder={nrmNamePlaceholder}
            onChange={(event) => onNrmNameChange(event.target.value)}
          />
        </label>

        <div className="save-modal__io">
          <IoGroup label="Input" values={inputLabels} />
          <IoGroup label="Output" values={outputLabels} />
        </div>

        {exportHint && <p className="save-modal__hint">{exportHint}</p>}
        <div className="save-modal__actions">
          <button type="button" className="save-modal__close-button save-modal__close-button--secondary" onClick={onClose}>
            Fechar
          </button>
          <ExportButton
            disabled={!canExport}
            onExport={(format) => {
              onExport(format);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface ExportButtonProps {
  disabled: boolean;
  onExport: (format: ModelExportFormat) => void;
}

/**
 * A split button: the main part exports the .nrm (model + dataset, the usual way to move a model
 * between sessions), and the arrow beside it opens a small menu to pick the format instead — the
 * .nrm again, or just the model's .json (no dataset; importable through "Importar Modelo" on a
 * dataset that's already loaded).
 */
function ExportButton({ disabled, onExport }: ExportButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function pick(format: ModelExportFormat) {
    setIsMenuOpen(false);
    onExport(format);
  }

  return (
    <div
      className="save-modal__split"
      // Closes the menu when focus leaves the whole control (a click elsewhere, tabbing away).
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsMenuOpen(false);
      }}
    >
      <button
        type="button"
        className="save-modal__close-button save-modal__split-main"
        onClick={() => pick('nrm')}
        disabled={disabled}
      >
        Exportar modelo (.nrm)
      </button>
      <button
        type="button"
        className="save-modal__close-button save-modal__split-arrow"
        onClick={() => setIsMenuOpen((open) => !open)}
        disabled={disabled}
        aria-label="Escolher o formato de exportação"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isMenuOpen && (
        <div className="save-modal__split-menu" role="menu">
          <button type="button" role="menuitem" className="save-modal__split-item" onClick={() => pick('nrm')}>
            Modelo + dados (.nrm)
          </button>
          <button type="button" role="menuitem" className="save-modal__split-item" onClick={() => pick('json')}>
            Só o modelo (.json)
          </button>
        </div>
      )}
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
