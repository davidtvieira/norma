import { Modal } from '../Modal/Modal';
import { SplitButton } from '../SplitButton/SplitButton';
import './SaveModal.css';

/** What "Guardar modelo" can export: the full .nrm bundle (model + dataset), just the model .json, or just the dataset's original spreadsheet. */
export type ModelExportFormat = 'nrm' | 'json' | 'dataset';

/** One designated input/output of the model, as listed (and reordered) in the dialog. */
export interface IoItem {
  id: string;
  label: string;
}

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
  /** The model's designated input/output operations, in the order they are exported and shown to
   * whoever utilizes the model (App.tsx's modelInputIds/modelOutputIds) — a model can have several
   * of each. Which operations they are is picked on the operation's node (see OperationPanel's
   * "Input"/"Output" toggles); this dialog only lets the author put them in order. */
  inputItems: IoItem[];
  outputItems: IoItem[];
  /** What the inputs list says while it is empty ("por definir", or "nenhum (modelo fixo)"). */
  inputEmptyText: string;
  onReorderInputs: (ids: string[]) => void;
  onReorderOutputs: (ids: string[]) => void;
}

/**
 * Reachable from the "Guardar modelo" button. Saving the model to the backend isn't wired up
 * yet, but exporting it as a .nrm file (see utils/nrmSerialization.ts) already is — a zip
 * bundling the model JSON together with the dataset's own spreadsheet, so the one saved file is
 * also enough to reopen it later via "Importar Modelo" without the dataset having to be
 * re-imported separately first.
 */
export function SaveModal({
  open,
  onClose,
  onExport,
  nrmName,
  onNrmNameChange,
  nrmNamePlaceholder,
  canExport,
  exportHint,
  inputItems,
  outputItems,
  inputEmptyText,
  onReorderInputs,
  onReorderOutputs,
}: SaveModalProps) {
  if (!open) return null;

  return (
    <Modal
      title="Guardar modelo"
      size="lg"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="modal__button modal__button--ghost" onClick={onClose}>
            Fechar
          </button>
          <ExportButton
            disabled={!canExport}
            onExport={(format) => {
              onExport(format);
              onClose();
            }}
          />
        </>
      }
    >
      <p className="modal__hint">
        Ainda não é possível guardar o modelo diretamente na plataforma. Pode, no entanto, exportá-lo como ficheiro .nrm (inclui o
        conjunto de dados) e voltar a importá-lo mais tarde.
      </p>

      <label className="save-modal__name">
        <span className="modal__label">Nome do ficheiro (.nrm)</span>
        <input
          type="text"
          className="modal__input"
          value={nrmName}
          placeholder={nrmNamePlaceholder}
          onChange={(event) => onNrmNameChange(event.target.value)}
        />
      </label>

      <div className="save-modal__io">
        <IoGroup label="Inputs" items={inputItems} emptyText={inputEmptyText} onReorder={onReorderInputs} />
        <IoGroup label="Outputs" items={outputItems} emptyText="por definir" onReorder={onReorderOutputs} />
      </div>

      {exportHint && <p className="modal__hint modal__hint--error">{exportHint}</p>}
    </Modal>
  );
}

interface ExportButtonProps {
  disabled: boolean;
  onExport: (format: ModelExportFormat) => void;
}

/**
 * The export button: the main part exports the .nrm (model + dataset, the usual way to move a
 * model between sessions), and the arrow beside it picks the format instead — the .nrm again, or
 * just the model's .json (no dataset; importable through "Importar Modelo" on a dataset that's
 * already loaded), or just the dataset's own file.
 */
function ExportButton({ disabled, onExport }: ExportButtonProps) {
  return (
    <SplitButton
      buttonClassName="modal__button"
      onClick={() => onExport('nrm')}
      disabled={disabled}
      arrowDisabled={disabled}
      arrowLabel="Escolher o formato de exportação"
      items={[
        { label: 'Ficheiro Norma (.nrm)', onSelect: () => onExport('nrm') },
        { label: 'Só o modelo (.json)', onSelect: () => onExport('json') },
        { label: 'Só os dados (ficheiro original)', onSelect: () => onExport('dataset') },
      ]}
    >
      Exportar modelo (.nrm)
    </SplitButton>
  );
}

interface IoGroupProps {
  label: string;
  items: IoItem[];
  emptyText: string;
  onReorder: (ids: string[]) => void;
}

/** One "Inputs"/"Outputs" group: every designated operation on its own numbered line, in the
 * order it will be exported and shown to whoever utilizes the model, with arrows to move it up or
 * down and a shortcut to sort the whole group by name (numbers inside names compared as numbers,
 * so "2." comes before "10."). */
function IoGroup({ label, items, emptyText, onReorder }: IoGroupProps) {
  // Moves the item at `index` to position `target` (clamped to the list), shifting the rest.
  function moveTo(index: number, target: number) {
    const clamped = Math.max(0, Math.min(items.length - 1, target));
    if (clamped === index) return;
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(clamped, 0, moved);
    onReorder(ids);
  }

  function sortByName() {
    const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
    onReorder(sorted.map((item) => item.id));
  }

  return (
    <div className="save-modal__io-group">
      <div className="save-modal__io-header">
        <span className="modal__label">
          {label}
          {items.length > 0 && ` (${items.length})`}
        </span>
        {items.length > 1 && (
          <button type="button" className="modal__chip" onClick={sortByName}>
            Ordenar por nome
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="save-modal__io-item save-modal__io-item--muted">{emptyText}</p>
      ) : (
        items.map((item, index) => (
          <div key={item.id} className="save-modal__io-row">
            <span className="save-modal__io-position">{index + 1}</span>
            <p className="save-modal__io-item save-modal__io-name" title={item.label}>
              {item.label}
            </p>
            <button
              type="button"
              className="save-modal__io-move"
              onClick={() => moveTo(index, 0)}
              disabled={index === 0}
              aria-label={`Mover para o início: ${item.label}`}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="m6 11 6-6 6 6M6 18l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="save-modal__io-move"
              onClick={() => moveTo(index, index - 1)}
              disabled={index === 0}
              aria-label={`Subir ${item.label}`}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="save-modal__io-move"
              onClick={() => moveTo(index, index + 1)}
              disabled={index === items.length - 1}
              aria-label={`Descer ${item.label}`}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="save-modal__io-move"
              onClick={() => moveTo(index, items.length - 1)}
              disabled={index === items.length - 1}
              aria-label={`Mover para o fim: ${item.label}`}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="m6 6 6 6 6-6M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}
