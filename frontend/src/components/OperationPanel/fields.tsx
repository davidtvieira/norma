import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
   * When given, adds a third "Coluna da tabela" source alongside static/dynamic: instead of
   * typing a value or picking a reference, the user clicks a column header directly in the sheet
   * viewer, same as ColumnPickerField's own picking flow (which this mirrors, just reached through
   * this field's modal instead of a dedicated button). `isPicking`/`pendingColumn` are this exact
   * field's own slice of the app-wide column-pick state (see OperationBodyContext's columnPick) —
   * true/non-null only while *this* field is the one being picked for, not any other field on the
   * card. Once picked, the column index is stored as a plain literal (`literalSource(String(...))`
   * — see the effect below), indistinguishable afterward from one typed in by hand; only the
   * *how* differs, not the resulting value or its pill.
   */
  columnPicker?: {
    isPicking: boolean;
    pendingColumn: number | null;
    onStart: () => void;
    onCancel: () => void;
  };
}

interface ValueSourcePickerModalProps {
  label: string;
  placeholder: string;
  inputType: 'text' | 'number';
  referenceOnly: boolean;
  referenceOptions: ReferenceOption[];
  /** Whether this field also offers the column-pick source (see ValueSourceField's own
   * `columnPicker` prop) — shows a third tab when true. */
  hasColumnPicker: boolean;
  /** Starts the column pick (see ValueSourceField's `columnPicker.onStart`) — closes this modal
   * immediately after, same as picking a reference or typing a static value does, since the actual
   * selection happens by clicking a header in the sheet viewer, not inside this modal. */
  onStartColumnPick: () => void;
  /** Which tab the modal opens on — 'dynamic' when reopening a field that already has (or last
   * had) a reference picked, 'static' otherwise. Purely a starting point; the user can still
   * switch tabs inside the modal unless referenceOnly hides the toggle entirely. */
  initialTab: 'static' | 'dynamic';
  onPickStatic: (value: string) => void;
  onPickReference: (operationId: string) => void;
  onClose: () => void;
}

/**
 * The static/dynamic picker for a chainable field (see ValueSourceField), moved into its own
 * modal rather than expanding inline on the operation's card — a toggle plus either a text field
 * or a full list of other operations to reference took up as much room as the rest of the card
 * combined, especially once several cards are stacked on the canvas. Either side is a two-step
 * pick-then-Confirmar, never committed the instant something's clicked/typed: clicking a
 * reference in the list only selects it (see selectedOperationId), and typing into the static
 * field obviously shouldn't close the modal on every keystroke either — one shared Confirmar
 * button (disabled until there's actually something to confirm) applies whichever tab is active.
 *
 * Rendered through a portal straight onto `document.body` rather than in place: a confirmed
 * operation's card (and therefore this modal, nested inside it via renderBody) lives inside the
 * canvas' `.operation-canvas__surface`, which carries its own pan/zoom `transform` — and a
 * `position: fixed` descendant of a transformed element is positioned relative to *that* element,
 * not the real viewport, per the CSS spec. Without the portal the overlay would pan/zoom and clip
 * along with the canvas instead of covering the whole screen.
 */
function ValueSourcePickerModal({
  label,
  placeholder,
  inputType,
  referenceOnly,
  referenceOptions,
  hasColumnPicker,
  onStartColumnPick,
  initialTab,
  onPickStatic,
  onPickReference,
  onClose,
}: ValueSourcePickerModalProps) {
  const [tab, setTab] = useState<'static' | 'dynamic' | 'column'>(initialTab);
  const [draftValue, setDraftValue] = useState('');
  // Which reference the user has clicked in the list below, if any — clicking only selects it
  // (see the option buttons' own onClick); Confirmar is what actually commits it, same two-step
  // flow as the static tab's text field + Confirmar, rather than committing the instant an option
  // is clicked.
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const isDynamicMode = referenceOnly || tab === 'dynamic';
  const isColumnMode = !referenceOnly && tab === 'column';
  // The column tab has no Confirmar step of its own — its dedicated "Selecionar coluna" button
  // (below) starts the pick and closes this modal in one action, since the actual selection
  // happens by clicking a header in the sheet viewer next, not by confirming anything in here.
  const canConfirm = isColumnMode ? false : isDynamicMode ? selectedOperationId !== null : draftValue.trim() !== '';

  function confirm() {
    if (isColumnMode) return;
    if (isDynamicMode) {
      if (selectedOperationId) onPickReference(selectedOperationId);
    } else if (draftValue.trim() !== '') {
      onPickStatic(draftValue);
    }
  }

  return createPortal(
    <div className="add-operation-modal__overlay" onClick={onClose}>
      <div
        className="add-operation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="value-source-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="value-source-modal-title" className="add-operation-modal__title">
          {label}
        </h2>

        {!referenceOnly && (
          <div className="operation-entry__source-toggle">
            <button
              type="button"
              className={`operation-entry__source-toggle-button${tab === 'static' ? ' operation-entry__source-toggle-button--active' : ''}`}
              onClick={() => setTab('static')}
            >
              Input estático
            </button>
            <button
              type="button"
              className={`operation-entry__source-toggle-button${tab === 'dynamic' ? ' operation-entry__source-toggle-button--active' : ''}`}
              onClick={() => setTab('dynamic')}
            >
              Input dinâmico
            </button>
            {hasColumnPicker && (
              <button
                type="button"
                className={`operation-entry__source-toggle-button${tab === 'column' ? ' operation-entry__source-toggle-button--active' : ''}`}
                onClick={() => setTab('column')}
              >
                Coluna da tabela
              </button>
            )}
          </div>
        )}

        {isColumnMode && (
          <div className="value-source-modal__column">
            <p className="operation-entry__chain-status">Escolha diretamente uma coluna na tabela à direita.</p>
            <button
              type="button"
              className="operation-entry__pick-button"
              onClick={() => {
                onStartColumnPick();
                onClose();
              }}
            >
              Selecionar coluna
            </button>
          </div>
        )}

        {!isDynamicMode && !isColumnMode && (
          <div className="value-source-modal__static">
            <input
              type={inputType}
              className="operation-entry__input"
              placeholder={placeholder}
              min={inputType === 'number' ? 0 : undefined}
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirm();
              }}
              autoFocus
            />
          </div>
        )}

        {isDynamicMode && (
          <div className="operation-entry__dynamic-input-menu">
            {referenceOptions.map((option) => (
              <button
                key={option.operationId}
                type="button"
                className={`operation-entry__dynamic-input-option${
                  selectedOperationId === option.operationId ? ' operation-entry__dynamic-input-option--active' : ''
                }`}
                onClick={() => setSelectedOperationId(option.operationId)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="add-operation-modal__actions">
          <button type="button" className="add-operation-modal__close-button" onClick={onClose}>
            Cancelar
          </button>
          {/* The column tab has its own dedicated "Selecionar coluna" button above instead — a
              disabled Confirmar next to it would just be dead weight, since that tab has nothing
              of its own left for it to confirm. */}
          {!isColumnMode && (
            <button type="button" className="value-source-modal__confirm-button" onClick={confirm} disabled={!canConfirm}>
              Confirmar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A chainable operation input (lookup's query, sum's start row): typing a plain value or pulling
 * it from another confirmed operation instead. Picking between the two, typing the value, and
 * picking which operation to reference all happen in a modal (see ValueSourcePickerModal) —
 * reached through a "Selecionar valor" button whenever there's nothing committed yet — rather
 * than inline on the card, which got crowded fast once a toggle, a text field and a whole list of
 * other operations all sat there alongside everything else the card already shows. Once
 * committed, the card only ever shows the result as a plain pill (the typed value, or the name of
 * the referenced operation) — never an editable field of its own, since typing only ever happens
 * in the modal. Clicking that pill removes the value outright (or, if `onRemove` is given,
 * removes the field/row entirely instead), bringing the "Selecionar valor" button back to add a
 * new one — same "click the picked value to change it" spirit as ColumnPickerField/
 * RangePickerField's own pill, just landing on removal here since re-adding is the modal's job.
 * With no referenceOptions at all, static is the only possible source, so there's nothing to
 * choose between and the field is a plain, directly-editable input straight away, modal and pill
 * both skipped entirely — always the case for renderInputEditor (referenceOptions is always `[]`
 * there — a model's designated input is filled in by whoever utilizes it, never chained), and
 * also whenever there's nothing yet to reference mid-build. referenceOnly is the mirror case: no
 * static tab in the modal at all, and with nothing yet to reference, a warning instead of a
 * button (see the blocked branch below).
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
  columnPicker,
}: ValueSourceFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const picking = columnPicker?.isPicking ?? false;

  // Whether there's an actual value in hand — a picked reference, or (for a plain typed field) any
  // non-empty text — derived straight from `source` rather than its own tracked state, so the
  // "Selecionar valor" button and the committed display below swap purely as a side effect of
  // typing/clearing the field or picking/removing a reference.
  const committed = source.type === 'reference' || (!referenceOnly && source.value !== '');
  // Whether there's a genuine choice worth a modal for — at least one other operation to
  // reference, or a column-pick capability, whether alongside a static option or (referenceOnly)
  // on its own as a list.
  const needsPicker = referenceOptions.length > 0 || columnPicker !== undefined;
  // The only possible source is a plain typed value — no picker needed at all, ever.
  const alwaysStatic = !referenceOnly && !needsPicker;
  // referenceOnly with nothing yet to reference — nothing to pick, so a warning instead of a
  // button that would just open an empty modal.
  const blocked = referenceOnly && !needsPicker;

  // Backs a confirmed dynamic reference out to nothing picked — the static side needs no
  // equivalent since clearing the field's own text already does the same thing (see `committed`).
  function reset() {
    onChange(literalSource(''));
  }

  function pickStatic(value: string) {
    onChange(literalSource(value));
    setIsPickerOpen(false);
  }

  function pickReference(operationId: string) {
    onChange({ type: 'reference', operationId });
    setIsPickerOpen(false);
  }

  // The pick started (see ValueSourcePickerModal's own "Selecionar coluna" button, which already
  // closed that modal) actually lands a column: mirrors ColumnPickerField's own effect exactly —
  // commit it as a plain literal the moment a column is clicked in the sheet, then finish the pick
  // so columnPick clears back to null app-wide.
  useEffect(() => {
    if (columnPicker?.isPicking && columnPicker.pendingColumn !== null) {
      onChange(literalSource(String(columnPicker.pendingColumn)));
      columnPicker.onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnPicker?.isPicking, columnPicker?.pendingColumn]);

  return (
    // A fragment, not a single div: the field itself (label + editable control) and the
    // "Entrada" readout below need to be *siblings*, not nested — the collapsed-card CSS
    // (.operation-card__details--collapsed) and the opened-card CSS
    // (.operation-card-modal__body) both key off direct children to show one and hide the
    // other, which only works if they're not both buried inside one wrapping div together.
    <>
    <div className={`operation-entry__field${picking ? ' operation-entry__field--active-pick' : ''}`}>
      <label className="operation-entry__label">{label}</label>

      {/* Column-pick in progress for this exact field — the ValueSourcePickerModal that started it
          (see its own "Selecionar coluna" button) already closed itself, and — if this field lives
          on a confirmed card's own detail modal — that modal closed too (see OperationPanel's
          renderConfirmedCard), so the sheet viewer is actually visible/clickable. This replaces
          every other control below (there's nothing else to show/edit until the pick resolves),
          and stays visible even on an otherwise-collapsed card (see the matching CSS exemption on
          .operation-entry__field--active-pick) so the "click a header" hint isn't just silently
          hidden along with everything else the collapse rule hides. */}
      {picking && (
        <div className="operation-column-picking">
          <span className="operation-column-picking__hint">Escolha uma coluna na tabela à direita</span>
          <button type="button" className="operation-column-picking__cancel" onClick={columnPicker?.onCancel}>
            Cancelar
          </button>
        </div>
      )}

      {!picking && blocked && <p className="operation-entry__chain-status">Não há nenhuma outra operação para referenciar ainda.</p>}

      {!picking && alwaysStatic && (
        <div className="operation-entry__static-input-row">
          <input
            type={inputType}
            className="operation-entry__input"
            placeholder={placeholder}
            min={inputType === 'number' ? 0 : undefined}
            value={source.type === 'literal' ? source.value : ''}
            onChange={(event) => onChange(literalSource(event.target.value))}
          />
        </div>
      )}

      {!picking && needsPicker && !committed && (
        <button type="button" className="operation-entry__pick-button" onClick={() => setIsPickerOpen(true)}>
          {referenceOnly ? 'Selecionar operação' : 'Selecionar valor'}
        </button>
      )}

      {/* A typed static value shows as a plain pill, not an editable field, once committed —
          typing only ever happens in the modal itself (see ValueSourcePickerModal). Clicking it
          removes the value outright (or, if `onRemove` is given, removes the field/row entirely
          instead), bringing back "Selecionar valor" to add a new one. */}
      {!picking && needsPicker && committed && source.type === 'literal' && (
        <button type="button" className="operation-column-pill operation-column-pill--pickable" onClick={onRemove ?? reset}>
          <span className="operation-column-pill__value">{source.value}</span>
        </button>
      )}

      {/* A dynamic pill only ever names the operation it points at — the value it currently
          resolves to is shown separately below instead (see the "Entrada" readout), not folded
          into the pill itself: that readout is meant to survive the card being collapsed (see
          .operation-entry__result's own note) but disappear once the card is actually opened,
          the exact opposite of this pill (and the plain input/static pill above), which exist to
          be edited and so are only ever shown while open. */}
      {!picking && source.type === 'reference' && (
        <>
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

      {isPickerOpen && (
        <ValueSourcePickerModal
          label={label}
          placeholder={placeholder}
          inputType={inputType}
          referenceOnly={referenceOnly}
          referenceOptions={referenceOptions}
          hasColumnPicker={columnPicker !== undefined}
          onStartColumnPick={() => columnPicker?.onStart()}
          initialTab={source.type === 'reference' ? 'dynamic' : 'static'}
          onPickStatic={pickStatic}
          onPickReference={pickReference}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </div>

    {/* This field's currently resolved value, styled the same way a kind's own result is (see
        e.g. LookupResult) — the "input" counterpart to that "output", distinguished from it by
        the --input modifier (no background fill, see OperationPanel.css) so the two read as
        input/output at a glance rather than two identical boxes. Labeled with this field's own
        `label` (e.g. "Valor a procurar") rather than a generic "Entrada" — a kind with more than
        one chainable field (e.g. lookup's own startRow/searchColumn/query) would otherwise show
        three identically-labeled readouts with no way to tell which is which. Meant to be
        visible while the card is collapsed (so both input and output read at a glance, without
        opening it — see .operation-card__details--collapsed's own exemption for
        .operation-entry__result, which this shares) and hidden once the card actually opens (see
        .operation-card-modal__body's own opposite rule), where the point is editing the field
        itself — the plain input/pick-button/pill above already shows a typed value directly,
        and this would otherwise just duplicate it right next to the very control that already
        has it. */}
    {resolvedInput.status === 'ready' && (
      <p className="operation-entry__result operation-entry__result--input">
        <span className="operation-entry__result-label">{label}:</span> {resolvedInput.value || '(vazio)'}
      </p>
    )}
    </>
  );
}
