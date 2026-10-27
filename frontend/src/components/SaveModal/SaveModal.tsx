import { ChevronDownIcon, ChevronUpIcon, ChevronsDownIcon, ChevronsUpIcon } from '../ButtonIcons/ButtonIcons';
import { useState } from 'react';
import { LoadingOverlay } from '../LoadingOverlay/LoadingOverlay';
import { Modal } from '../Modal/Modal';
import { SplitButton } from '../SplitButton/SplitButton';
import './SaveModal.css';

/** What "Guardar modelo" can export: a copy kept in the platform's library, the full .nrm bundle (model + dataset), just the model .json, or just the dataset's original spreadsheet. */
export type ModelExportFormat = 'library' | 'nrm' | 'json' | 'dataset';

/** One designated input/output of the model, as listed (and reordered) in the dialog. */
export interface IoItem {
  id: string;
  label: string;
}

interface SaveModalProps {
  open: boolean;
  /** The model is already in the library: the main button updates that entry. */
  isUpdate: boolean;
  onClose: () => void;
  /** Resolves once the export is done — only the platform copy takes any time. */
  onExport: (format: ModelExportFormat) => void | Promise<void>;
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
  isUpdate,
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
  const [isSaving, setIsSaving] = useState(false);
  if (!open) return null;

  // Saving to the platform takes a moment, so the dialog stays (with a loading overlay) until it is done; the
  // confirmation is a toast, shown by whoever did the saving. Every other format downloads and closes at once.
  async function exportAs(format: ModelExportFormat) {
    if (format !== 'library') {
      onExport(format);
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await onExport(format);
      onClose();
    } catch {
      // The API toast already says what went wrong.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={isUpdate ? 'Atualizar modelo' : 'Guardar modelo'}
      size="lg"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="modal__button modal__button--ghost" onClick={onClose}>
            Fechar
          </button>
          <ExportButton label={isUpdate ? 'Atualizar' : 'Guardar'} disabled={!canExport || isSaving} onExport={exportAs} />
        </>
      }
    >
      <p className="modal__hint">
        {isUpdate
          ? '"Atualizar" substitui o modelo guardado em "Os meus modelos Norma".'
          : '"Guardar" mantém o modelo na plataforma, em "Os meus modelos Norma".'}
      </p>

      <label className="save-modal__name">
        <span className="modal__label">Nome do modelo Norma</span>
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
      {isSaving && <LoadingOverlay delayMs={200} />}
    </Modal>
  );
}

interface ExportButtonProps {
  label: string;
  disabled: boolean;
  onExport: (format: ModelExportFormat) => void;
}

/**
 * The save button: the main part keeps the model in the platform's library (it then shows under "Os meus
 * modelos"), and the arrow beside it picks another way instead — download the .nrm (model + dataset, the
 * usual way to move a model between machines), just the model's .json (importable through "Importar
 * Modelo" on a dataset that's already loaded), or just the dataset's own file.
 */
function ExportButton({ label, disabled, onExport }: ExportButtonProps) {
  return (
    <SplitButton
      buttonClassName="modal__button"
      onClick={() => onExport('library')}
      disabled={disabled}
      arrowDisabled={disabled}
      arrowLabel="Outras formas de guardar"
      items={[
        { label: 'Exportar ficheiro Norma (.nrm)', onSelect: () => onExport('nrm') },
        { label: 'Só o modelo (.json)', onSelect: () => onExport('json') },
        { label: 'Só os dados (ficheiro original)', onSelect: () => onExport('dataset') },
      ]}
    >
      {label}
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
    <div className="save-modal__io-column">
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
      <div className="save-modal__io-group">
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
                <ChevronsUpIcon />
              </button>
              <button
                type="button"
                className="save-modal__io-move"
                onClick={() => moveTo(index, index - 1)}
                disabled={index === 0}
                aria-label={`Subir ${item.label}`}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                className="save-modal__io-move"
                onClick={() => moveTo(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`Descer ${item.label}`}
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className="save-modal__io-move"
                onClick={() => moveTo(index, items.length - 1)}
                disabled={index === items.length - 1}
                aria-label={`Mover para o fim: ${item.label}`}
              >
                <ChevronsDownIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
