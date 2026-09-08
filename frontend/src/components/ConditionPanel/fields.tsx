import { useEffect } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';

/**
 * Shared field widgets used inside a condition kind's draft config (see conditionKind.ts) —
 * kept separate from ConditionPanel.tsx so kind modules importing these don't create a
 * circular import with the orchestrator that imports the kinds.
 */

interface TableSelectProps {
  label: string;
  dataset: DatasetImportResponse;
  sheetIndex: number | '';
  onSelect: (sheetIndex: number) => void;
}

export function TableSelect({ label, dataset, sheetIndex, onSelect }: TableSelectProps) {
  return (
    <div className="condition-entry__field">
      <label className="condition-entry__label">{label}</label>
      <select
        className="condition-entry__select"
        value={sheetIndex}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        <option value="" disabled>
          Selecione uma tabela
        </option>
        {dataset.sheets.map((sheet, index) => (
          <option key={sheet.sheetName} value={index}>
            {sheet.sheetName}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ColumnPickerFieldProps {
  label: string;
  value: number | '';
  isPicking: boolean;
  pendingColumn: number | null;
  onStart: () => void;
  onConfirm: (column: number) => void;
  onCancel: () => void;
  onClear: () => void;
}

export function ColumnPickerField({
  label,
  value,
  isPicking,
  pendingColumn,
  onStart,
  onConfirm,
  onCancel,
  onClear,
}: ColumnPickerFieldProps) {
  // Clicking a column header in the sheet viewer commits it immediately — no separate
  // confirm step.
  useEffect(() => {
    if (isPicking && pendingColumn !== null) {
      onConfirm(pendingColumn);
    }
  }, [isPicking, pendingColumn, onConfirm]);

  return (
    <div className="condition-entry__field">
      <label className="condition-entry__label">{label}</label>

      {!isPicking && value === '' && (
        <button type="button" className="condition-entry__pick-button" onClick={onStart}>
          Selecionar coluna
        </button>
      )}

      {!isPicking && value !== '' && (
        <div className="condition-column-pill">
          <span className="condition-column-pill__value">Coluna {value}</span>
          <button type="button" className="condition-column-pill__clear" onClick={onClear} aria-label="Alterar coluna">
            ×
          </button>
        </div>
      )}

      {isPicking && (
        <div className="condition-column-picking">
          <span className="condition-column-picking__hint">Escolha uma coluna na tabela à direita</span>
          <button type="button" className="condition-column-picking__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
