import { useEffect, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import { literalSource, type ValueSource } from '../../types/valueSource';
import type { ReferenceOption } from './operationKind';
import type { ResolvedInput } from '../../utils/resolveOperationInputs';

/**
 * Shared field widgets used inside an operation kind's draft config (see operationKind.ts) —
 * kept separate from OperationPanel.tsx so kind modules importing these don't create a
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
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>
      <select
        className="operation-entry__select"
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
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {!isPicking && value === '' && (
        <button type="button" className="operation-entry__pick-button" onClick={onStart}>
          Selecionar coluna
        </button>
      )}

      {!isPicking && value !== '' && (
        <div className="operation-column-pill">
          <span className="operation-column-pill__value">Coluna {value}</span>
          <button type="button" className="operation-column-pill__clear" onClick={onClear} aria-label="Alterar coluna">
            ×
          </button>
        </div>
      )}

      {isPicking && (
        <div className="operation-column-picking">
          <span className="operation-column-picking__hint">Escolha uma coluna na tabela à direita</span>
          <button type="button" className="operation-column-picking__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

interface ValueSourceFieldProps {
  label: string;
  placeholder: string;
  inputType: 'text' | 'number';
  source: ValueSource;
  onChange: (source: ValueSource) => void;
  referenceOptions: ReferenceOption[];
  resolvedInput: ResolvedInput;
}

/**
 * A chainable operation input (lookup's query, sum's start row): normally a plain text/number
 * field, plus an "Input dinâmico" button — mirrors the "+ Adicionar operação" button+menu
 * pattern — that opens a menu of other confirmed operations to pull the value from instead.
 * Picking one swaps the field for a pill (mirrors ColumnPickerField) showing that operation's
 * live result; × reverts to a plain typed value. Hidden entirely when there's nothing to chain
 * to yet, so a single operation looks exactly like before this feature existed.
 */
export function ValueSourceField({
  label,
  placeholder,
  inputType,
  source,
  onChange,
  referenceOptions,
  resolvedInput,
}: ValueSourceFieldProps) {
  const [isChoosingReference, setIsChoosingReference] = useState(false);

  function chooseReference(operationId: string) {
    onChange({ type: 'reference', operationId });
    setIsChoosingReference(false);
  }

  return (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {source.type === 'literal' && (
        <>
          <input
            type={inputType}
            className="operation-entry__input"
            placeholder={placeholder}
            min={inputType === 'number' ? 0 : undefined}
            value={source.value}
            onChange={(event) => onChange(literalSource(event.target.value))}
          />

          {referenceOptions.length > 0 && !isChoosingReference && (
            <button
              type="button"
              className="operation-entry__dynamic-input-button"
              onClick={() => setIsChoosingReference(true)}
            >
              Input dinâmico
            </button>
          )}

          {isChoosingReference && (
            <div className="operation-entry__dynamic-input-menu">
              {referenceOptions.map((option) => (
                <button
                  key={option.operationId}
                  type="button"
                  className="operation-entry__dynamic-input-option"
                  onClick={() => chooseReference(option.operationId)}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                className="operation-column-picking__cancel"
                onClick={() => setIsChoosingReference(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </>
      )}

      {source.type === 'reference' && (
        <>
          <div className="operation-column-pill">
            <span className="operation-column-pill__value">
              Resultado de: {referenceOptions.find((option) => option.operationId === source.operationId)?.label ?? '?'}
            </span>
            <button
              type="button"
              className="operation-column-pill__clear"
              onClick={() => onChange(literalSource(''))}
              aria-label="Usar valor fixo"
            >
              ×
            </button>
          </div>

          <p className="operation-entry__chain-status">
            {resolvedInput.status === 'pending' && 'A aguardar o resultado dessa operação…'}
            {resolvedInput.status === 'missing' && 'Essa operação já não existe.'}
            {resolvedInput.status === 'cycle' && 'Referência circular entre operações.'}
            {resolvedInput.status === 'ready' && `Valor atual: ${resolvedInput.value || '(vazio)'}`}
          </p>
        </>
      )}
    </div>
  );
}
