import { useEffect, useState } from 'react';
import type { CellRange } from '../../types/cellRange';
import type { DatasetImportResponse } from '../../types/dataset';
import { literalSource, type ValueSource } from '../../types/valueSource';
import type { ReferenceOption } from './operationKind';
import type { ResolvedInput } from '../../utils/resolveOperationInputs';

/**
 * Shared field widgets used inside an operation kind's draft config (see operationKind.ts) —
 * kept separate from OperationPanel.tsx so kind modules importing these don't create a
 * circular import with the orchestrator that imports the kinds.
 */

/** Confirms a typed static value or a picked dynamic reference (see ValueSourceField below). */
function ConfirmValueButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="operation-entry__value-confirm-button" onClick={onClick} aria-label="Confirmar valor">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Backs a confirmed static/dynamic value out to nothing picked (see ValueSourceField below). */
function ResetSourceButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="operation-entry__reset-button" onClick={onClick} aria-label="Alterar">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 6 18 18M6 18 18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

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
}

export function ColumnPickerField({ label, value, isPicking, pendingColumn, onStart, onConfirm, onCancel }: ColumnPickerFieldProps) {
  // Clicking a column header in the sheet viewer commits it immediately — no separate
  // confirm step. onCancel here is really "finish picking" (it's what clears the picker
  // state up in App), so it also runs on a successful pick, not just on Cancelar — otherwise
  // the sheet tabs would stay locked to this column's sheet (tabsDisabled tracks picker state)
  // for as long as the operation is left without an explicit Cancelar click.
  useEffect(() => {
    if (isPicking && pendingColumn !== null) {
      onConfirm(pendingColumn);
      onCancel();
    }
  }, [isPicking, pendingColumn, onConfirm, onCancel]);

  return (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {!isPicking && value === '' && (
        <button type="button" className="operation-entry__pick-button" onClick={onStart}>
          Selecionar coluna
        </button>
      )}

      {!isPicking && value !== '' && (
        <button type="button" className="operation-column-pill operation-column-pill--pickable" onClick={onStart}>
          <span className="operation-column-pill__value">Coluna {value}</span>
        </button>
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

function formatCellRange(range: CellRange): string {
  const rows = range.startRow === range.endRow ? `Linha ${range.startRow}` : `Linhas ${range.startRow}-${range.endRow}`;
  const columns =
    range.startColumn === range.endColumn ? `Coluna ${range.startColumn}` : `Colunas ${range.startColumn}-${range.endColumn}`;
  return `${rows} · ${columns}`;
}

interface RangePickerFieldProps {
  label: string;
  value: CellRange | null;
  isPicking: boolean;
  pendingRange: CellRange | null;
  onStart: () => void;
  onConfirm: (range: CellRange) => void;
  onCancel: () => void;
}

/**
 * The range-based counterpart of ColumnPickerField: instead of a single column, the user drags
 * a rectangle of cells directly in the sheet viewer (see SheetViewer's rangePicker prop), like
 * selecting a range in Excel. Releasing the drag commits it immediately, mirroring how a column
 * click commits immediately in ColumnPickerField.
 */
export function RangePickerField({ label, value, isPicking, pendingRange, onStart, onConfirm, onCancel }: RangePickerFieldProps) {
  useEffect(() => {
    if (isPicking && pendingRange !== null) {
      onConfirm(pendingRange);
      onCancel();
    }
  }, [isPicking, pendingRange, onConfirm, onCancel]);

  return (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {!isPicking && value === null && (
        <button type="button" className="operation-entry__pick-button" onClick={onStart}>
          Selecionar intervalo
        </button>
      )}

      {!isPicking && value !== null && (
        <button type="button" className="operation-column-pill operation-column-pill--pickable" onClick={onStart}>
          <span className="operation-column-pill__value">{formatCellRange(value)}</span>
        </button>
      )}

      {isPicking && (
        <div className="operation-column-picking">
          <span className="operation-column-picking__hint">Arraste sobre as células da tabela à direita para selecionar um intervalo</span>
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
 * A chainable operation input (lookup's query, sum's start row): a static/dynamic toggle picks
 * between typing a plain value and pulling it from another confirmed operation instead. Either
 * side reveals its own control right there, in flow, once picked: "Input estático" a plain field
 * with a ✓ to confirm it, "Input dinâmico" a list of the other confirmed operations — clicking
 * one selects and confirms it immediately, collapsing to a pill naming the chosen operation (the
 * value it feeds in, and this operation's own result computed from it, both render separately —
 * see the kind's renderBody, e.g. LookupResult in lookupKind.tsx). Confirming either way hides
 * the toggle (and, for dynamic, the option list) down to just the confirmed value, with a × to
 * back out and pick again. The "Input dinâmico" side of the toggle only appears once there's
 * something to chain to; with nothing to chain to yet, "Input estático" is the only button and
 * stays pre-selected, so the toggle still renders (for a consistent look across every operation)
 * without asking for an extra click to reveal the field.
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
  // Which side of the toggle the user has actually picked — null until they click one, so
  // neither button starts highlighted and nothing shows below the toggle on a fresh field.
  // Reopening an existing operation (source already a reference, or a literal with a real typed
  // value) counts as an implicit pick, so the toggle reflects what's already configured. With no
  // referenceOptions there's no "Input dinâmico" side to offer, so static is the only choice —
  // it starts pre-selected rather than making the field look unset.
  const [chosen, setChosen] = useState<'static' | 'dynamic' | null>(() => {
    if (source.type === 'reference') return 'dynamic';
    if (source.value !== '' || referenceOptions.length === 0) return 'static';
    return null;
  });
  // Once confirmed, the toggle (and the dynamic option list) stays out of the way — an existing
  // reference or a real typed value counts as already confirmed, same as chosen above.
  const [confirmed, setConfirmed] = useState<boolean>(() => source.type === 'reference' || source.value !== '');

  // The toggle buttons act as real on/off switches: clicking the side that's already selected
  // turns it back off instead of re-selecting it, so both can end up deselected again, same as
  // before either was ever clicked.
  function goStatic() {
    if (chosen === 'static') {
      setChosen(null);
      return;
    }
    setChosen('static');
    if (source.type === 'reference') {
      onChange(literalSource(''));
    }
  }

  function goDynamic() {
    setChosen((current) => (current === 'dynamic' ? null : 'dynamic'));
  }

  // Backs all the way out to nothing picked, bringing the toggle back — the one way back once a
  // value's been confirmed.
  function reset() {
    setChosen(null);
    setConfirmed(false);
    onChange(literalSource(''));
  }

  return (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {!confirmed && (
        <div className="operation-entry__source-toggle">
          <button
            type="button"
            className={`operation-entry__source-toggle-button${chosen === 'static' ? ' operation-entry__source-toggle-button--active' : ''}`}
            onClick={goStatic}
          >
            Input estático
          </button>
          {referenceOptions.length > 0 && (
            <button
              type="button"
              className={`operation-entry__source-toggle-button${chosen === 'dynamic' ? ' operation-entry__source-toggle-button--active' : ''}`}
              onClick={goDynamic}
            >
              Input dinâmico
            </button>
          )}
        </div>
      )}

      {chosen === 'static' && source.type === 'literal' && (
        <div className="operation-entry__static-input-row">
          <input
            type={inputType}
            className="operation-entry__input"
            placeholder={placeholder}
            min={inputType === 'number' ? 0 : undefined}
            value={source.value}
            onChange={(event) => onChange(literalSource(event.target.value))}
          />
          {confirmed ? <ResetSourceButton onClick={reset} /> : <ConfirmValueButton onClick={() => setConfirmed(true)} />}
        </div>
      )}

      {chosen === 'dynamic' && !confirmed && (
        <div className="operation-entry__dynamic-input-menu">
          {referenceOptions.map((option) => (
            <button
              key={option.operationId}
              type="button"
              className="operation-entry__dynamic-input-option"
              onClick={() => {
                onChange({ type: 'reference', operationId: option.operationId });
                setConfirmed(true);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {chosen === 'dynamic' && source.type === 'reference' && (
        <>
          <div className="operation-column-pill">
            <span className="operation-column-pill__value">
              {referenceOptions.find((option) => option.operationId === source.operationId)?.label ?? '?'}
            </span>
            <ResetSourceButton onClick={reset} />
          </div>

          {(resolvedInput.status === 'missing' || resolvedInput.status === 'cycle') && (
            <p className="operation-entry__chain-status">
              {resolvedInput.status === 'missing' && 'Essa operação já não existe.'}
              {resolvedInput.status === 'cycle' && 'Referência circular entre operações.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
