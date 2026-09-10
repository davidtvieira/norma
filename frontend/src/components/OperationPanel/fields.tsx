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
  /**
   * When true, this field can only ever be a reference to another operation — no "Input
   * estático" side to the toggle, no plain typed value at all. Used by counter, which sums
   * *other operations'* results by design, not values typed in by hand; with nothing yet to
   * reference, this shows a warning instead of a field with nothing useful to pick.
   */
  referenceOnly?: boolean;
  /**
   * Overrides what clicking a confirmed *dynamic* pill does: instead of backing out to the
   * reference list (the default — see `reset`), it removes this field/row entirely. Used by
   * counter, where each input is its own removable row rather than a single fixed field — once a
   * row's reference is picked, clicking its pill deletes that row outright (the same way a fresh,
   * not-yet-picked row is cancelled — see CounterInputs' own row-remove button) instead of just
   * clearing back to "pick again".
   */
  onRemove?: () => void;
  /**
   * True once this field's operation has been marked as the model's designated input (see
   * OperationPanel's "Input" toggle) — that value is supplied by whoever utilizes the model
   * (ModelCard), not typed in here while building it, so the toggle/typed-value/reference UI is
   * replaced with an explanatory note instead of an editable field.
   */
  disabled?: boolean;
}

/**
 * A chainable operation input (lookup's query, sum's start row): a static/dynamic toggle picks
 * between typing a plain value and pulling it from another confirmed operation instead. Either
 * side reveals its own control right there, in flow, once picked: "Input estático" a plain field
 * with a ✓ to confirm it, "Input dinâmico" a list of the other confirmed operations — clicking
 * one selects and confirms it immediately, collapsing to a pill naming the chosen operation (the
 * value it feeds in, and this operation's own result computed from it, both render separately —
 * see the kind's renderBody, e.g. LookupResult in lookupKind.tsx). Confirming either way hides
 * the toggle (and, for dynamic, the option list) down to just the confirmed value — for dynamic,
 * the pill itself is the way back (clicking it resets, same "click the picked value to change it"
 * pattern as ColumnPickerField/RangePickerField's own pill — or, if `onRemove` is given, removes
 * the field/row entirely instead), not a separate × next to it. Static works the same way but
 * needs no click at all: "committed" (see below) is derived straight from the typed value rather
 * than a separate confirm step, so the toggle just hides itself once something's typed and comes
 * back the moment the field's cleared back to empty — nothing to click to "confirm" or "remove"
 * either side of that. The "Input dinâmico" side of the toggle only appears once there's something
 * to chain to; with nothing to chain to yet, static is the only possible source, so the toggle
 * itself is skipped entirely and the field just shows straight away — no pointless single-button
 * choice standing in front of it. That's always the case for renderInputEditor (referenceOptions
 * is always `[]` there — a model's designated input is filled in by whoever utilizes it, never
 * chained), and also whenever there's nothing yet to reference mid-build. referenceOnly is the
 * mirror case: no static fallback at all (see the warning branch below).
 */
export function ValueSourceField({
  label,
  placeholder,
  inputType,
  source,
  onChange,
  referenceOptions,
  resolvedInput,
  referenceOnly = false,
  onRemove,
  disabled = false,
}: ValueSourceFieldProps) {
  // Which side of the toggle the user has actually picked — null until they click one, so
  // neither button starts highlighted and nothing shows below the toggle on a fresh field.
  // Reopening an existing operation (source already a reference, or a literal with a real typed
  // value) counts as an implicit pick, so the toggle reflects what's already configured. With no
  // referenceOptions there's no "Input dinâmico" side to offer, so static is the only choice —
  // it starts pre-selected rather than making the field look unset. referenceOnly has no static
  // side at all, so it only ever starts as 'dynamic' (once there's something to reference) or
  // unset (see the warning branch below).
  const [chosen, setChosen] = useState<'static' | 'dynamic' | null>(() => {
    if (source.type === 'reference') return 'dynamic';
    if (referenceOnly) return referenceOptions.length > 0 ? 'dynamic' : null;
    if (source.value !== '' || referenceOptions.length === 0) return 'static';
    return null;
  });
  // Whether there's an actual value in hand — a picked reference, or (for a plain typed field) any
  // non-empty text — derived straight from `source` rather than its own tracked state, so the
  // toggle/dynamic-menu below hide and reappear purely as a side effect of typing/clearing the
  // field or picking/removing a reference, with no separate confirm or reset click needed either
  // way.
  const committed = source.type === 'reference' || (!referenceOnly && source.value !== '');

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

  // Backs a confirmed dynamic reference out to the reference list (or the toggle, for a
  // non-referenceOnly field) — the static side needs no equivalent since clearing the field's own
  // text already does the same thing (see `committed` above).
  function reset() {
    setChosen(referenceOnly && referenceOptions.length > 0 ? 'dynamic' : null);
    onChange(literalSource(''));
  }

  if (disabled) {
    return (
      <div className="operation-entry__field">
        <label className="operation-entry__label">{label}</label>
        <p className="operation-entry__chain-status">
          Definido como input do modelo — o valor é introduzido ao utilizar o modelo.
        </p>
      </div>
    );
  }

  return (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>

      {/* With no referenceOptions there's no real choice to present — "static" is the only
          possible source (see chosen's own initializer above), so the toggle would just be a
          single "Input estático" button standing between the user and the field it already always
          resolves to. Skip straight to the field instead — used as-is by renderInputEditor
          (always referenceOptions={[]}: a model's designated input is always typed in by whoever
          utilizes it, never a reference), and also naturally applies mid-build whenever there's
          nothing yet to reference. */}
      {!committed && !referenceOnly && referenceOptions.length > 0 && (
        <div className="operation-entry__source-toggle">
          <button
            type="button"
            className={`operation-entry__source-toggle-button${chosen === 'static' ? ' operation-entry__source-toggle-button--active' : ''}`}
            onClick={goStatic}
          >
            Input estático
          </button>
          <button
            type="button"
            className={`operation-entry__source-toggle-button${chosen === 'dynamic' ? ' operation-entry__source-toggle-button--active' : ''}`}
            onClick={goDynamic}
          >
            Input dinâmico
          </button>
        </div>
      )}

      {!committed && referenceOnly && referenceOptions.length === 0 && (
        <p className="operation-entry__chain-status">Não há nenhuma outra operação para referenciar ainda.</p>
      )}

      {chosen === 'static' && !referenceOnly && source.type === 'literal' && (
        <div className="operation-entry__static-input-row">
          <input
            type={inputType}
            className="operation-entry__input"
            placeholder={placeholder}
            min={inputType === 'number' ? 0 : undefined}
            value={source.value}
            onChange={(event) => onChange(literalSource(event.target.value))}
          />
        </div>
      )}

      {chosen === 'dynamic' && !committed && referenceOptions.length > 0 && (
        <div className="operation-entry__dynamic-input-menu">
          {referenceOptions.map((option) => (
            <button
              key={option.operationId}
              type="button"
              className="operation-entry__dynamic-input-option"
              onClick={() => onChange({ type: 'reference', operationId: option.operationId })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {chosen === 'dynamic' && source.type === 'reference' && (
        <>
          {/* Clicking the pill itself backs out to the static/dynamic toggle (or, for
              referenceOnly, straight back to the reference list) — same "click the picked value
              to change it" pattern as ColumnPickerField/RangePickerField's own pill (see
              --pickable in OperationPanel.css) — instead of a separate × sitting next to it. */}
          <button type="button" className="operation-column-pill operation-column-pill--pickable" onClick={onRemove ?? reset}>
            <span className="operation-column-pill__value">
              {referenceOptions.find((option) => option.operationId === source.operationId)?.label ?? '?'}
            </span>
          </button>

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
