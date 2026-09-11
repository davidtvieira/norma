import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependencyChain, getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, getInputSources, literalSource, remapValueSourceReferences } from '../../types/valueSource';
import type { SerializableEntry } from '../../utils/modelSerialization';
import { parseTestCaseFile } from '../../utils/testCaseSerialization';
import type { OperationFields, ReferenceOption } from './operationKind';
import { KINDS, KINDS_BY_ID } from './kinds/registry';
import { AddOperationModal } from '../AddOperationModal/AddOperationModal';
import { TestValuesModal } from '../TestValuesModal/TestValuesModal';
import { useCanvasViewport, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from './useCanvasViewport';
import type { NodePosition } from './useCanvasViewport';
import './OperationPanel.css';

/**
 * The operation canvas: a freeform, pannable surface where each operation is an independently
 * draggable node instead of a fixed list item. A node whose input dynamically references another
 * operation's result (see types/valueSource.ts) gets a connecting line drawn between the two
 * nodes (see the `edges` computation in the orchestrator at the bottom of this file) rather than
 * being nested inside the source node's DOM — every confirmed operation is its own independent,
 * draggable node either way. The draft/edit card chrome (name + cancel, a type-specific config
 * area, confirm/delete) and the confirmed-card chrome (name + edit + model input/output toggles,
 * hover) are shared; anything type-specific is delegated to whichever "kind" (see
 * operationKind.ts) an entry was created as.
 */

/** Fixed node width used both for layout (inline style) and edge-anchor math. */
const NODE_WIDTH = 300;
/** The dotted background grid's dot spacing at 100% zoom, in screen pixels — see the viewport's
 * inline backgroundSize style, which scales this by the current zoom to match. Must match the
 * 22px baked into OperationPanel.css's own background-size (kept there as the un-zoomed default,
 * so the grid still looks right for the split second before the first render's inline style
 * applies). */
const GRID_SIZE = 22;
/** Vertical offset from a node's top to its header's center — where edges attach — constant
 * regardless of how tall the node's body grows (result text, expanded info, ...). */
const NODE_HEADER_ANCHOR_Y = 28;
const NODES_PER_ROW = 3;
const NODE_COLUMN_GAP = 340;
const NODE_ROW_GAP = 240;

/** How far apart "Testar modelo" staggers each confirmed operation's own live-result request
 * (see runModelTest) — small enough that testing a model still feels close to instant, big
 * enough that a model with many operations sends the API a trickle of requests instead of a
 * burst all in the same instant. */
const TEST_STAGGER_DELAY_MS = 120;
/** How long the progress bar (see runModelTest/testProgress) stays visible at 100% once the
 * stagger itself has finished, before fading away on its own — just long enough to actually
 * register as "done" rather than the bar vanishing the instant it fills. */
const TEST_PROGRESS_LINGER_MS = 500;

/** Simple cascading grid placement for a node restored without a saved position (see
 * initialEntries) — anchored at a fixed canvas-local origin regardless of the current pan/zoom,
 * since there's no "current viewport" the entries being restored are meaningfully tied to (they
 * arrive all at once, before the user has looked at the canvas at all). A freshly added operation
 * uses viewportPlacementFor below instead, which *is* anchored to what's currently on screen. */
function placementFor(index: number): NodePosition {
  const column = index % NODES_PER_ROW;
  const row = Math.floor(index / NODES_PER_ROW);
  return { x: 40 + column * NODE_COLUMN_GAP, y: 40 + row * NODE_ROW_GAP };
}

/** Same cascading grid as placementFor, but anchored just inside the top-left corner of whatever
 * part of the canvas is currently visible (converting a fixed screen-space padding back to
 * canvas-local coordinates via the surface's own pan/zoom — the inverse of the transform applied
 * in the JSX below) instead of a fixed canvas-local origin — so a newly added operation lands
 * right where the user's already looking and can be dragged immediately, instead of needing to be
 * hunted down after panning/zooming away from wherever entries.length happened to place it. */
function viewportPlacementFor(viewOffset: NodePosition, zoom: number, index: number): NodePosition {
  const screenPadding = 40;
  const anchorX = (screenPadding - viewOffset.x) / zoom;
  const anchorY = (screenPadding - viewOffset.y) / zoom;
  const column = index % NODES_PER_ROW;
  const row = Math.floor(index / NODES_PER_ROW);
  return { x: anchorX + column * NODE_COLUMN_GAP, y: anchorY + row * NODE_ROW_GAP };
}

interface DraftOperationCardProps {
  name: string;
  onNameChange: (name: string) => void;
  canConfirm: boolean;
  /** "Atualizar operação" for one reopened via "Editar" — undefined while staging a new-operation
   * batch, where there's no per-card confirm at all (see renderDraftCard's 'stage' mode and
   * OperationPanel's confirmAllStaged/renderConfigPanel's own "+", the batch's shared controls
   * instead). */
  confirmLabel?: string;
  onConfirm?: () => void;
  children: ReactNode;
}

/**
 * An operation being built, staged, or edited: name, then whatever type-specific config the kind
 * renders as `children`, then a confirm button ("Atualizar operação") while editing an existing
 * one — a staged (not yet confirmed) card has no button of its own at all; adding another to the
 * batch and confirming the whole batch are both controls shared across every staged card at once
 * (see renderConfigPanel's own "+" and its batch-confirm button below the staged list), not
 * per-card. Always
 * shown inside the config panel (see OperationPanel's renderConfigPanel), whose own × already
 * cancels — reverting an edit back to its confirmed state, or discarding a staged batch — so
 * there's no separate delete button here; deleting an already-confirmed operation outright is the
 * canvas selection bar's job now (select it, then "Eliminar" — see the select tool).
 */
function DraftOperationCard({ name, onNameChange, canConfirm, confirmLabel, onConfirm, children }: DraftOperationCardProps) {
  return (
    <div className="operation-entry">
      <input
        type="text"
        className="operation-entry__name-input"
        value={name}
        placeholder="Nome da operação"
        onChange={(event) => onNameChange(event.target.value)}
      />

      {children}

      {canConfirm && onConfirm && confirmLabel && (
        <div className="operation-entry__confirm-row">
          <button type="button" className="operation-entry__confirm-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}

interface EditButtonProps {
  onEdit: () => void;
  disabled: boolean;
}

function EditButton({ onEdit, disabled }: EditButtonProps) {
  return (
    <button
      type="button"
      className="operation-card__edit"
      onClick={onEdit}
      disabled={disabled}
      aria-label="Editar operação"
      title={disabled ? 'Termine a operação em curso antes de editar outra.' : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

interface RevealButtonProps {
  onReveal: () => void;
}

/**
 * Opens (or brings to front) the off-canvas sheet panel showing this operation's table, with its
 * columns/range tinted — the config/edit panel already shows every other detail (which table,
 * which columns, the range), so this is just a shortcut to actually see the affected cells
 * instead of duplicating that detail on the card itself.
 */
function RevealButton({ onReveal }: RevealButtonProps) {
  return (
    <button type="button" className="operation-card__reveal" onClick={onReveal} aria-label="Ver na folha de dados" title="Ver na folha de dados">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

interface TestUpToHereButtonProps {
  onTest: () => void;
}

/**
 * Runs "Testar modelo" scoped to just this operation's own dependency chain — itself and every
 * operation it (transitively) reads its input from (see getDependencyChain), not every confirmed
 * operation on the canvas — so checking one operation's result doesn't also wait on, or spend API
 * calls testing, unrelated ones elsewhere in the model.
 */
function TestUpToHereButton({ onTest }: TestUpToHereButtonProps) {
  return (
    <button type="button" className="operation-card__test" onClick={onTest} aria-label="Testar até aqui" title="Testar até aqui">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 4.5v15l13-7.5-13-7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

interface IoToggleProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

/** Marks/clears this node as the model's designated input or output (see ConfirmedOperationCard). */
function IoToggle({ label, active, onToggle }: IoToggleProps) {
  return (
    <button
      type="button"
      className={active ? 'operation-card__io-toggle operation-card__io-toggle--active' : 'operation-card__io-toggle'}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `Remover como ${label.toLowerCase()} do modelo` : `Definir como ${label.toLowerCase()} do modelo`}
    >
      {label}
    </button>
  );
}

interface ConfirmedOperationCardProps {
  name: string;
  /** e.g. "Pesquisa aninhada"/"Somar" — shown in the footer, always visible (see
   * ConfirmedOperationCard's own note on why this stays out of the collapsible section). */
  kindLabel: string;
  /** The "which table/columns/range" detail (see operationKind.ts's renderSummary) — shown next
   * to kindLabel in the footer. */
  summary: ReactNode;
  onEdit: () => void;
  editDisabled: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Whether this operation's own testSignal has fired at least once — draws a primary-color
   * border on the card, regardless of whether the result itself was a success, an error, or no
   * match (see .operation-card--tested). */
  isTested: boolean;
  /** Runs "Testar modelo" scoped to just this operation's own dependency chain — see
   * TestUpToHereButton/runModelTest(upToEntryId). */
  onTestUpToHere: () => void;
  onReveal: () => void;
  /** Whether this operation actually has a sheet location to reveal — false for kinds that never
   * highlight any column/range (see sheetIndexForEntry) — so the reveal button doesn't sit there
   * as a dead click. */
  isRevealEligible: boolean;
  children: ReactNode;
  isModelInput: boolean;
  isModelInputEligible: boolean;
  onToggleModelInput: () => void;
  isModelOutput: boolean;
  onToggleModelOutput: () => void;
  /** Whether this card's detail modal (its editable field(s) + live result — see `children`) is
   * currently open. Owned by OperationPanel (modalEntryId) rather than local state so it isn't
   * lost if this card unmounts and remounts (e.g. entries reordering), and so opening one card's
   * modal can close whichever other one was open. */
  /** Opening is triggered by OperationPanel itself, not by an onClick here — a plain click (not a
   * drag) on the node already has to be distinguished from an actual reposition drag in its own
   * mousedown/mouseup handling (see startNodeDrag/handleMouseUp), so that's also where it decides
   * a click should open this card's modal instead. */
  isModalOpen: boolean;
  onCloseModal: () => void;
}

/**
 * A confirmed operation node: name + model input/output toggles + reveal-in-sheet + edit
 * (pencil, reopens it as a draft) in the header, then a footer naming its kind and which
 * table/columns/range it's set up against ("the affected fields") — both always visible, enough
 * on their own to identify which operation a card is at a glance. Only its live result (always
 * visible, see below) and its type-specific editable field(s) need an actual click to reach —
 * clicking the card opens `children` (the kind's editable fields + live result, i.e.
 * kind.renderBody's output) in a modal instead of expanding it inline, since the canvas can be
 * panned/zoomed (via a CSS transform on an ancestor — see the surface's own transform in this
 * file) and a `position: fixed` dialog would otherwise inherit that transform instead of actually
 * centering on the real viewport.
 *
 * `children` is portaled into one of two places — never rendered twice, so a kind's live result
 * component (its own fetch-dedup/in-flight state — see e.g. LookupResult's notes) is never
 * duplicated or remounted (which would both re-fire its request and, worse, wipe the result this
 * card reports into the reference chain for "Testar modelo") just from opening/closing the modal:
 * `inlineSlot` sits inside this card itself, showing only the live result (every kind ends
 * `children` with one .operation-entry__result, by convention — see .operation-card__details in
 * OperationPanel.css) while the modal's closed; `modalSlot` sits inside the modal, showing
 * everything, while it's open. Both are plain DOM nodes created once up front (not discovered via
 * a ref callback on rendered JSX) specifically so the portal always has a valid target to move
 * `children` into — if there were ever a render with nowhere to put it, React would unmount it
 * instead of relocating it, which is exactly the state loss/duplicate-fetch problem this avoids.
 */
function ConfirmedOperationCard({
  name,
  kindLabel,
  summary,
  onEdit,
  editDisabled,
  onMouseEnter,
  onMouseLeave,
  isTested,
  onTestUpToHere,
  onReveal,
  isRevealEligible,
  children,
  isModelInput,
  isModelInputEligible,
  onToggleModelInput,
  isModelOutput,
  onToggleModelOutput,
  isModalOpen,
  onCloseModal,
}: ConfirmedOperationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const modalPlaceholderRef = useRef<HTMLDivElement>(null);
  const [inlineSlot] = useState(() => {
    const node = document.createElement('div');
    node.className = 'operation-card__details operation-card__details--collapsed';
    return node;
  });
  const [modalSlot] = useState(() => {
    const node = document.createElement('div');
    node.className = 'operation-card-modal__body';
    return node;
  });

  // Attaches inlineSlot right after the footer, once, for this card's whole lifetime — its own
  // position never changes; only whether it currently *hosts* `children` (vs. the modal doing so
  // instead) does, via the portal below.
  useLayoutEffect(() => {
    cardRef.current?.appendChild(inlineSlot);
    return () => {
      inlineSlot.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attaches modalSlot inside the modal's own DOM (portaled to document.body below) only while
  // it's open — the modal chrome itself (backdrop, title, close button) is plain JSX and free to
  // remount on every open/close; it holds no state worth preserving, unlike `children`.
  useLayoutEffect(() => {
    if (!isModalOpen) return;
    modalPlaceholderRef.current?.appendChild(modalSlot);
    return () => {
      modalSlot.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseModal();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, onCloseModal]);

  return (
    <div
      className={isTested ? 'operation-card operation-card--tested' : 'operation-card'}
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          {isModelInputEligible && <IoToggle label="Input" active={isModelInput} onToggle={onToggleModelInput} />}
          <IoToggle label="Output" active={isModelOutput} onToggle={onToggleModelOutput} />
          <TestUpToHereButton onTest={onTestUpToHere} />
          {isRevealEligible && <RevealButton onReveal={onReveal} />}
          <EditButton onEdit={onEdit} disabled={editDisabled} />
        </div>
      </div>

      <div className="operation-card__footer">
        <span className="operation-card__kind">{kindLabel}</span>
        <span className="operation-card__summary">{summary}</span>
      </div>

      {createPortal(children, isModalOpen ? modalSlot : inlineSlot)}

      {isModalOpen &&
        createPortal(
          <div className="operation-card-modal__overlay" onClick={onCloseModal}>
            <div
              className="operation-card-modal"
              role="dialog"
              aria-modal="true"
              aria-label={name || 'Operação sem nome'}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="operation-card-modal__header">
                <div>
                  <h3 className="operation-card-modal__name">{name || 'Operação sem nome'}</h3>
                  <div className="operation-card-modal__meta">
                    <span className="operation-card__kind">{kindLabel}</span>
                    <span className="operation-card__summary">{summary}</span>
                  </div>
                </div>
                <button type="button" className="operation-card-modal__close" onClick={onCloseModal} aria-label="Fechar">
                  ×
                </button>
              </div>

              <div ref={modalPlaceholderRef} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Overrides the API's (English) labels with their Portuguese display names — the id is still
// what's sent to/matched against the API, only the label shown in the UI is translated here.
const KIND_LABELS: Record<string, string> = {
  lookup: 'Pesquisa aninhada',
  sum: 'Somar',
  counter: 'Contador',
  node: 'Nó',
  find: 'Localizar',
  translator: 'Tradutor',
};

interface OperationEntryState {
  id: string;
  name: string;
  kindId: string;
  confirmed: boolean;
  fields: OperationFields;
  position: NodePosition;
}

/**
 * Not cryptographically unique, just unlikely enough to collide within one session — plain
 * crypto.randomUUID() requires a secure context (HTTPS or localhost), which isn't guaranteed
 * for every way this app gets served in development.
 */
function generateEntryId(): string {
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pure by design: React 18 StrictMode invokes functional setState updaters twice in
 * development to catch impure ones, so this must not rely on shared mutable state.
 */
function createEntry(id: string, kindId: string, name: string, dataset: DatasetImportResponse, position: NodePosition): OperationEntryState {
  return {
    id,
    name,
    kindId,
    confirmed: false,
    fields: KINDS_BY_ID[kindId].createFields(dataset),
    position,
  };
}

interface OperationPanelProps {
  dataset: DatasetImportResponse;
  /** Seeds the entry list on mount (e.g. a model just imported on the previous screen). Restores
   * each entry's saved canvas position (see modelSerialization's own EntryPosition) — only an
   * entry from a model exported before positions were saved falls back to the usual cascading
   * placement (see placementFor). */
  initialEntries?: SerializableEntry[];
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  rangePick: RangePickState | null;
  onStartRangePick: (entryId: string, sheetIndex: number) => void;
  onFinishRangePick: () => void;
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  onRangeHighlightsChange: (highlights: RangeHighlight[]) => void;
  onCellHighlightChange: (highlight: OperationHighlight | null) => void;
  /** Opens the off-canvas sheet panel to the given sheet (see RevealButton/App.tsx) — the click
   * counterpart to hovering a card, which only tints the sheet if the panel already happens to
   * be open. */
  onRevealInSheet: (sheetIndex: number) => void;
  /** Closes that sheet panel — called once an operation is confirmed (see renderDraftCard's
   * onConfirm), since picking a column/range keeps it open for exactly as long as it's needed to
   * build/edit that operation, and there's nothing left to do with it once that's done. */
  onOperationConfirmed: () => void;
  /** Whether that sheet panel is currently open — used only to clear the "revealed" operation
   * once it closes (see the effect below), so reopening it later some other way (e.g. "Ver
   * dados") doesn't show a stale highlight left over from whatever was last revealed. */
  isSheetPanelOpen: boolean;
  /** Reports the current entry list up so App.tsx can export it (see the "Guardar modelo" flow). */
  onEntriesChange: (entries: SerializableEntry[]) => void;
  /** The model's designated inputs/outputs — picked directly on a node's toggles below (see
   * ConfirmedOperationCard) instead of in the save modal. Owned by App.tsx, same as the
   * column/range pick state above, since it has to survive an operation being deleted/edited. A
   * model can have several of each, independently toggled. */
  modelInputIds: string[];
  modelOutputIds: string[];
  onModelInputIdsChange: (ids: string[]) => void;
  onModelOutputIdsChange: (ids: string[]) => void;
}

interface Edge {
  fromId: string;
  toId: string;
  from: NodePosition;
  to: NodePosition;
}

/** A smooth left-to-right connector between a "from" node's right edge and a "to" node's left
 * edge, both anchored at the header's vertical center (see NODE_HEADER_ANCHOR_Y). */
function edgePath({ from, to }: Edge): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEADER_ANCHOR_Y;
  const endX = to.x;
  const endY = to.y + NODE_HEADER_ANCHOR_Y;
  const controlOffset = Math.max(60, Math.abs(endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

/**
 * Operation canvas. Both adding a new operation and editing an existing one are configured in
 * the left-docked panel (see renderConfigPanel), not on the canvas itself — a confirmed node on
 * the canvas only shows its name, model input/output toggles, and its live input/result;
 * whatever table/columns/range it's set up against is visible in that panel (see the pencil) or
 * by revealing it in the sheet (see RevealButton), not on the card. From there each kind renders
 * its own config and input/result, but the surrounding node chrome — name/cancel/edit/confirm/
 * delete, model input/output toggles, and hover behavior — is all shared.
 */
export function OperationPanel({
  dataset,
  initialEntries,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  rangePick,
  onStartRangePick,
  onFinishRangePick,
  onColumnHighlightsChange,
  onRangeHighlightsChange,
  onCellHighlightChange,
  onRevealInSheet,
  onOperationConfirmed,
  isSheetPanelOpen,
  onEntriesChange,
  modelInputIds,
  modelOutputIds,
  onModelInputIdsChange,
  onModelOutputIdsChange,
}: OperationPanelProps) {
  const [entries, setEntries] = useState<OperationEntryState[]>(() =>
    (initialEntries ?? []).map((entry, index) => ({ ...entry, position: entry.position ?? placementFor(index) })),
  );
  const operationTypes = useOperationTypes();
  // Snapshot of an operation's confirmed state, taken when it enters edit mode — lets the ×
  // cancel the edit (restore the snapshot) instead of deleting an already-confirmed operation.
  const [editSnapshots, setEditSnapshots] = useState<Record<string, OperationEntryState>>({});
  // The confirmed operation card currently under the mouse, if any.
  const [hoveredOperationId, setHoveredOperationId] = useState<string | null>(null);
  // The confirmed operation last "revealed" (see RevealButton) — unlike hover, this sticks
  // around after the mouse leaves the card, so its sheet highlight stays visible while looking
  // at the panel that was just opened for it. Hovering a different card still shows that one's
  // highlight in the meantime (see activeHighlightId below); leaving it falls back to this one.
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const activeHighlightId = hoveredOperationId ?? selectedOperationId;
  // Which confirmed card, if any, currently has its detail modal open (its editable fields +
  // live result — see ConfirmedOperationCard) — at most one at a time, so opening a different
  // card's modal replaces whichever was open rather than stacking.
  const [modalEntryId, setModalEntryId] = useState<string | null>(null);

  // Clears the pinned highlight once the sheet panel it was shown in closes — otherwise
  // reopening the panel later some other way (e.g. "Ver dados", unrelated to any particular
  // operation) would still show whatever was last revealed, which by then may no longer match
  // what's being worked on.
  useEffect(() => {
    if (!isSheetPanelOpen) {
      setSelectedOperationId(null);
    }
  }, [isSheetPanelOpen]);
  // The row each operation's query currently matches (if any) — only meaningful for kinds
  // that implement getCellHighlight (currently just lookup).
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});
  // Bumped by "Testar modelo" (see runModelTest below) — passed through to each entry's own
  // renderBody (see operationKind.ts) as the one signal that should make it actually call its
  // endpoint, instead of every result live-fetching as soon as its inputs are ready. Keyed by
  // entry id (rather than one number shared by every entry) so runModelTest can stagger *when*
  // each entry's own bump actually lands — a model with many operations would otherwise fire
  // every one of their live-result requests against the API in the very same instant.
  const [testSignals, setTestSignals] = useState<Record<string, number>>({});
  // Whether "Testar modelo" has fired at least once — the counterpart of testSignal's own "=== 0"
  // check before testSignal became per-entry (see "Limpar teste"'s disabled/title logic below),
  // which needed a single shared value to compare against 0 in the first place.
  const [hasTested, setHasTested] = useState(false);
  // Bumped by "Limpar teste" — the counterpart to testSignals: clears every kind's shown result
  // back to not-tested without needing to change any of its fields first.
  const [resetSignal, setResetSignal] = useState(0);
  // How far a "Testar modelo" run has staggered through the confirmed operations so far — null
  // whenever one isn't in progress (nothing to show a bar for). Drives the progress bar at the
  // top of the canvas (see below); purely observational, doesn't gate anything itself.
  const [testProgress, setTestProgress] = useState<{ done: number; total: number } | null>(null);
  // Pending runModelTest timeouts (see below), so a fresh "Testar modelo" click — or "Limpar
  // teste" — can cancel whatever's left of a previous stagger instead of letting it keep firing
  // requests for a test that's already been superseded or cleared.
  const testStaggerTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timeoutId of testStaggerTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  function cancelPendingTestStagger() {
    for (const timeoutId of testStaggerTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    testStaggerTimeoutsRef.current = [];
    setTestProgress(null);
  }

  /**
   * "Testar modelo" itself: bumps every confirmed operation's own testSignal, one at a time in
   * canvas order, each TEST_STAGGER_DELAY_MS after the last — instead of bumping one signal
   * every operation would react to at once, which is exactly what would otherwise turn "test a
   * model with a lot of operations" into a burst of simultaneous requests against the API. A
   * chained operation still effectively waits on top of this for its own reference to resolve
   * (see resolveOperationInputs), same as before; this only changes when an *independent*
   * operation's own request actually goes out. testProgress is bumped alongside each signal
   * purely so the progress bar shown on the button has something to show; it fades away shortly
   * after the last one fires rather than lingering at 100% indefinitely.
   *
   * `upToEntryId`, if given, narrows the run to just that operation's own dependency chain (see
   * getDependencyChain) — itself and everything it (transitively) reads its input from — instead
   * of every confirmed operation on the canvas. This is what each card's own "Testar até aqui"
   * button (see ConfirmedOperationCard) uses: check one operation's result without waiting on
   * (or spending API calls testing) unrelated ones elsewhere in the model.
   */
  function runModelTest(upToEntryId?: string) {
    cancelPendingTestStagger();
    setHasTested(true);

    const chain = upToEntryId ? getDependencyChain(upToEntryId, entries) : null;
    const confirmedIds = entries.filter((entry) => entry.confirmed && (!chain || chain.has(entry.id))).map((entry) => entry.id);
    if (confirmedIds.length === 0) return;

    setTestProgress({ done: 0, total: confirmedIds.length });
    confirmedIds.forEach((id, index) => {
      const timeoutId = window.setTimeout(() => {
        setTestSignals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
        setTestProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
      }, index * TEST_STAGGER_DELAY_MS);
      testStaggerTimeoutsRef.current.push(timeoutId);
    });

    const clearProgressTimeoutId = window.setTimeout(() => {
      setTestProgress(null);
    }, confirmedIds.length * TEST_STAGGER_DELAY_MS + TEST_PROGRESS_LINGER_MS);
    testStaggerTimeoutsRef.current.push(clearProgressTimeoutId);
  }
  // Set when "Importar teste" fails to parse a file — shown next to the toolbar's own test
  // buttons, cleared on the next successful load.
  const [testLoadError, setTestLoadError] = useState<string | null>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);
  // Whether the test-values modal (see TestValuesModal) is open — only reachable when the model
  // has at least one designated input; with none, "Testar modelo" runs immediately since there's
  // nothing to review first.
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // The existing (already-confirmed) operation currently reopened for editing in the left-docked
  // config panel (see renderConfigPanel and editEntry) — mutually exclusive with stagingEntryIds
  // below, never both at once. Cleared once that entry resolves — reverted or re-confirmed (see
  // the effect below).
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // Brand-new operations being prepared together as a batch in the same panel (see
  // renderConfigPanel) — a kind picked from "+ Adicionar operação" starts this list with one
  // entry; the panel's own "+" below the staged list (see addToStaging) appends another of that
  // same kind to it, without confirming any of them yet. Nothing in the batch actually joins the
  // canvas until its batch-confirm button ("Adicionar operador"/"Adicionar N operadores" — see
  // confirmAllStaged) confirms the whole list at once — that's the entire point of staging
  // several before committing, rather than confirming (and closing the panel) one at a time the
  // way editing still does.
  const [stagingEntryIds, setStagingEntryIds] = useState<string[]>([]);
  // Each confirmed operation's latest computed result (as a string), keyed by entry id — the
  // frontend-only stand-in for a chain: another operation's "input" field can reference an id
  // here instead of a typed value. Null means "no value yet" (loading, error, or not found).
  const [results, setResults] = useState<Record<string, string | null>>({});
  const resolvedInputsByEntry = resolveOperationInputs(entries, results);

  // Which canvas tool is active: "pan" (default) drags the background to scroll the canvas,
  // "select" instead drags a marquee to bulk-select nodes (see the toolbar toggle and
  // useCanvasViewport's own marquee handling). Switching away from "select" drops whatever was
  // selected — a leftover selection would otherwise linger, invisible, back in "pan" mode.
  const [tool, setTool] = useState<'pan' | 'select'>('pan');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Copied operations, kept purely in memory (nothing persisted, same as everything else on this
  // canvas) — see copySelection/pasteClipboardAt. Cleared only by copying again, never by pasting,
  // so the same copy can be pasted more than once.
  const [clipboard, setClipboard] = useState<OperationEntryState[] | null>(null);
  // True once "Colar" has been clicked and is waiting for the placement click on the canvas (see
  // handleViewportClick) — lets the user choose where the pasted copy lands instead of it always
  // dropping on top of the original, which would bury it under (or overlapping) the rest of the
  // model.
  const [pendingPaste, setPendingPaste] = useState(false);

  // The canvas' own pan/zoom/marquee-select/node-drag mechanics — see useCanvasViewport for why
  // this is split out rather than living directly here: none of it needs to know what an
  // operation entry actually is, only its id and on-screen box.
  const { viewOffset, zoom, pan, marqueeRect, viewportRef, nodeRefs, nodeZIndex, startPan, startMarquee, startNodeDrag, zoomBy, handleViewportWheel } =
    useCanvasViewport({
      entries,
      onDragEntry: (id, position) => updateEntry(id, { position }),
      // A click (not a drag) on a node: in "select" mode that toggles the node's selection;
      // otherwise (plain "pan" mode) it opens that node's detail modal instead.
      onNodeClick: (id) => {
        if (tool === 'select') {
          setSelectedIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
        } else {
          setModalEntryId(id);
        }
      },
      onMarqueeSelect: setSelectedIds,
    });

  // Lets App.tsx export the model (see the "Guardar modelo" flow) without entries living there.
  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  // Closes the edit panel once the entry it was editing resolves — reverted (× cancels back to
  // its confirmed snapshot — see cancelEntry) or, in principle, confirmed some other way. Driven
  // by `entries` rather than the panel's own × so every way that entry can resolve is covered by
  // one place. Staging has no equivalent effect: confirmAllStaged and removeFromStaging both
  // already update stagingEntryIds themselves, directly, since nothing else can change a staged
  // entry's confirmed status out from under them (staged entries are hidden from the canvas —
  // see the entries.map filter below — so the select tool's bulk delete can't touch them either).
  useEffect(() => {
    if (!editingEntryId) return;
    const entry = entries.find((item) => item.id === editingEntryId);
    if (!entry || entry.confirmed) {
      setEditingEntryId(null);
    }
  }, [entries, editingEntryId]);

  // Sheet column/range tints: every operation being built/edited shows what it's picked, and so
  // does the active (hovered, or last revealed — see activeHighlightId) confirmed operation —
  // regardless of whether its kind also has an exact-cell highlight to show (e.g. lookup, once
  // it has a match): that's a separate, more precise overlay drawn on top (see the effect below),
  // not a replacement, since a lookup with no match yet (or not typed into) would otherwise show
  // no highlight at all despite still having a definite search/result column.
  useEffect(() => {
    const columns: ColumnHighlight[] = [];
    const ranges: RangeHighlight[] = [];
    for (const entry of entries) {
      const kind = KINDS_BY_ID[entry.kindId];
      const isActive = entry.confirmed ? entry.id === activeHighlightId : true;
      if (isActive) {
        columns.push(...kind.getColumnHighlights(entry.fields));
        ranges.push(...(kind.getRangeHighlights?.(entry.fields) ?? []));
      }
    }
    onColumnHighlightsChange(columns);
    onRangeHighlightsChange(ranges);
  }, [entries, activeHighlightId, onColumnHighlightsChange, onRangeHighlightsChange]);

  // Exact input/output cell highlight: only for the active confirmed operation whose kind
  // supports that precision, and only once it actually has a match.
  useEffect(() => {
    const entry = entries.find((item) => item.id === activeHighlightId && item.confirmed);
    const kind = entry ? KINDS_BY_ID[entry.kindId] : null;
    if (!entry || !kind?.getCellHighlight) {
      onCellHighlightChange(null);
      return;
    }
    onCellHighlightChange(kind.getCellHighlight(entry.fields, matchedRows[entry.id] ?? null));
  }, [entries, activeHighlightId, matchedRows, onCellHighlightChange]);

  // Mousedown on empty canvas background: places a pending paste (see handleViewportClick, which
  // does the actual placing on the following click), starts a marquee drag in "select" mode, or
  // pans the canvas otherwise — whichever's active, never more than one at a time.
  function handleViewportMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (pendingPaste) return;
    if (tool === 'select') {
      startMarquee(event);
      return;
    }
    startPan(event);
  }

  // The companion click handler for a pending paste (see "Colar" in the toolbar) — fires after
  // handleViewportMouseDown above declines to pan/marquee-select while one's pending, so this is
  // the only thing a click on the canvas does in that state: place the clipboard at wherever was
  // clicked, converting the click's screen position back to the same canvas-local coordinate
  // space node positions already live in (undoing the viewport's own offset and the surface's pan
  // transform — see the JSX below).
  function handleViewportClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!pendingPaste) return;
    // Ignore a click that landed on an existing node (it still bubbles up here) — pasting
    // straight on top of it is exactly the overlap this whole placement step exists to avoid;
    // pendingPaste stays on so the very next click on actual empty canvas still places it.
    if ((event.target as HTMLElement).closest('.operation-canvas__node')) return;
    const viewportBox = viewportRef.current?.getBoundingClientRect();
    if (!viewportBox) return;
    pasteClipboardAt({
      x: (event.clientX - viewportBox.left - viewOffset.x) / zoom,
      y: (event.clientY - viewportBox.top - viewOffset.y) / zoom,
    });
  }

  function updateEntry(id: string, patch: Partial<OperationEntryState>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function updateEntryFields(id: string, patch: OperationFields) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, fields: { ...entry.fields, ...patch } } : entry)),
    );
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setEditSnapshots((current) => {
      if (!(id in current)) return current;
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
    setResults((current) => {
      if (!(id in current)) return current;
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
    setModalEntryId((current) => (current === id ? null : current));
    // Its nodeRefs entry (owned by useCanvasViewport) is left in place rather than deleted here —
    // harmless: nothing looks a deleted id up again once it's gone from `entries` (see that
    // hook's own note on why).
  }

  // "Copiar" in the selection bar (see the toolbar below) — snapshots the selected entries as
  // plain data (structuredClone, so later edits to the originals can't leak into the clipboard or
  // vice versa) without touching the canvas. Kept until the next copy, not the next paste — the
  // same clipboard can seed more than one paste.
  function copySelection() {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    setClipboard(entries.filter((entry) => selectedSet.has(entry.id)).map((entry) => structuredClone(entry)));
  }

  // "Eliminar" in the selection bar — same per-entry cleanup as a single removeEntry, just for
  // every selected id at once.
  function deleteSelection() {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      removeEntry(id);
    }
    setSelectedIds([]);
  }

  // Places whatever's in the clipboard at `position` (already converted to the same canvas-local
  // coordinate space node positions live in — see handleViewportClick), preserving the copied
  // group's own relative layout: its bounding box's top-left lands exactly at `position`, and
  // every other copied node keeps its original offset from that corner. Every copied id gets a
  // fresh one, and any reference between two operations that were copied together is rewritten to
  // point at its own new copy (see remapValueSourceReferences) rather than the original — a
  // reference to an operation outside the copied group is left pointing at that original, since
  // it's still there on the canvas. The pasted copy becomes the new selection, mirroring what
  // copying-then-pasting does in most other canvas tools.
  function pasteClipboardAt(position: NodePosition) {
    if (!clipboard || clipboard.length === 0) {
      setPendingPaste(false);
      return;
    }

    const idMap: Record<string, string> = {};
    for (const entry of clipboard) {
      idMap[entry.id] = generateEntryId();
    }
    const minX = Math.min(...clipboard.map((entry) => entry.position.x));
    const minY = Math.min(...clipboard.map((entry) => entry.position.y));

    const pasted = clipboard.map((entry) => ({
      ...entry,
      id: idMap[entry.id],
      name: entry.name ? `${entry.name} (cópia)` : entry.name,
      fields: remapValueSourceReferences(entry.fields, idMap),
      position: { x: position.x + (entry.position.x - minX), y: position.y + (entry.position.y - minY) },
    }));

    setEntries((current) => [...current, ...pasted]);
    setSelectedIds(pasted.map((entry) => entry.id));
    setPendingPaste(false);
  }

  function labelForEntry(id: string): string {
    return entries.find((entry) => entry.id === id)?.name || 'Operação sem nome';
  }

  // What a given operation's "input" field can reference: every other confirmed operation,
  // except ones that (transitively) already read their own input from this one — offering those
  // would let the user wire up a cycle from the picker itself.
  function referenceOptionsFor(entryId: string): ReferenceOption[] {
    const dependents = getDependents(entryId, entries);
    return entries
      .filter((entry) => entry.confirmed && entry.id !== entryId && !dependents.has(entry.id))
      .map((entry) => ({ operationId: entry.id, label: labelForEntry(entry.id) }));
  }

  function editEntry(id: string) {
    if (entries.some((entry) => !entry.confirmed)) return;
    const entry = entries.find((item) => item.id === id);
    if (entry) {
      setEditSnapshots((current) => ({ ...current, [id]: entry }));
    }
    updateEntry(id, { confirmed: false });
    // Opens the same left-docked config panel used for adding a new operation — the node
    // disappears from the canvas while it's being edited (see the entries.map filter below), so
    // its detail modal (if open) wouldn't have anything left to show either.
    setModalEntryId((current) => (current === id ? null : current));
    setEditingEntryId(id);
  }

  // × in the draft toolbar's edit panel: discards the in-progress changes and restores the
  // operation to how it looked before editing started, instead of deleting it — editEntry always
  // snapshots first, so this is only ever reached with one already there.
  function cancelEntry(id: string) {
    const snapshot = editSnapshots[id];
    if (!snapshot) {
      removeEntry(id);
      return;
    }

    setEntries((current) => current.map((entry) => (entry.id === id ? snapshot : entry)));
    setEditSnapshots((current) => {
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
  }

  function labelForKind(kindId: string): string {
    return KIND_LABELS[kindId] ?? operationTypes.find((type) => type.id === kindId)?.label ?? kindId;
  }

  // One row per designated input, always reflecting whatever's currently set for it (typed
  // directly on its own node, or loaded via "Importar teste") — feeds TestValuesModal (already
  // filled in, not starting blank) and decides whether "Importar teste" has anything to fill and
  // where a loaded file's entries land by name (see loadTestCase). App.tsx computes its own
  // equivalent list for "Guardar teste", which now lives next to "Guardar modelo" instead of in
  // this toolbar. Always a literal (see isModelInputEligible below), same invariant ModelCard's
  // own input fields rely on.
  const testInputEntries = modelInputIds
    .map((id) => entries.find((entry) => entry.id === id && entry.confirmed))
    .filter((entry): entry is OperationEntryState => entry !== undefined)
    .map((entry) => {
      const source = getInputSource(entry.fields);
      return { id: entry.id, name: entry.name, value: source.type === 'literal' ? source.value : '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  function updateTestValue(id: string, value: string) {
    updateEntryFields(id, { input: literalSource(value) });
  }

  // "Testar modelo" itself when the model has no designated input (nothing to review — runs
  // immediately); otherwise opens TestValuesModal so the values can be checked/adjusted first,
  // pre-filled from testInputEntries above rather than starting blank.
  function openTestModal() {
    setIsTestModalOpen(true);
  }

  function runTestFromModal() {
    setIsTestModalOpen(false);
    runModelTest();
  }

  function triggerImportTest() {
    setTestLoadError(null);
    testFileInputRef.current?.click();
  }

  // Matches each saved value against a currently-present input by exact name (see
  // testCaseSerialization.ts for why name, not id) — a name from the file with no match on the
  // canvas today is silently skipped, and a current input not mentioned in the file is left
  // exactly as it was. Only fills the input fields, same as typing the values in by hand — it
  // does NOT run the model itself; "Testar modelo" is a separate, explicit click.
  function loadTestCase(file: File) {
    parseTestCaseFile(file)
      .then((parsed) => {
        setTestLoadError(null);
        for (const input of parsed.inputs) {
          const matched = testInputEntries.find((entry) => entry.name === input.name);
          if (matched) {
            updateTestValue(matched.id, input.value);
          }
        }
      })
      .catch((error) => {
        setTestLoadError(error instanceof Error ? error.message : 'Falha ao carregar o teste.');
      });
  }

  // Picking a kind in the add modal (starting a fresh batch) or clicking a staged card's own "+"
  // (see DraftOperationCard's onAddAnotherOfSameKind, adding another of the same kind to the
  // current one) both add to the same staging batch — the new draft doesn't appear on the canvas
  // until the whole batch is confirmed at once (see confirmAllStaged below), unlike editEntry's
  // single entry, which confirms (and closes the panel) on its own.
  function addToStaging(kindId: string) {
    const label = labelForKind(kindId);
    const id = generateEntryId();
    // Cascades by how many are already in *this* staging batch, not by the canvas' total entry
    // count — anchored to wherever the viewport currently is (see viewportPlacementFor), so a
    // batch of several added at once fans out near each other and near the user, regardless of
    // how many other operations already exist elsewhere on the canvas.
    const position = viewportPlacementFor(viewOffset, zoom, stagingEntryIds.length);
    setEntries((current) => {
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(id, kindId, `${label} ${order}`, dataset, position)];
    });
    setStagingEntryIds((current) => [...current, id]);
  }

  // A staged card's own × (see renderConfigPanel) — drops just that one operation out of the
  // batch, leaving the rest of it exactly as it was; unlike cancelStaging below, which discards
  // the whole batch at once.
  function removeFromStaging(id: string) {
    removeEntry(id);
    setStagingEntryIds((current) => current.filter((entryId) => entryId !== id));
  }

  // The panel's own × while staging (see renderConfigPanel) — discards every operation in the
  // batch; none of them were ever confirmed onto the canvas, so there's nothing to revert (unlike
  // cancelEntry's single edited operation, which always has a snapshot to fall back to instead).
  function cancelStaging() {
    for (const id of stagingEntryIds) {
      removeEntry(id);
    }
    setStagingEntryIds([]);
  }

  // The staging batch's confirm button ("Adicionar operador"/"Adicionar N operadores" — see
  // renderConfigPanel) — the one point where staging actually adds anything to the canvas/model:
  // every operation prepared in the batch is confirmed at once, together, instead of one at a
  // time the way editing (or the old single-draft flow) used to.
  function confirmAllStaged() {
    const staged = new Set(stagingEntryIds);
    setEntries((current) => current.map((entry) => (staged.has(entry.id) ? { ...entry, confirmed: true } : entry)));
    onOperationConfirmed();
    setStagingEntryIds([]);
  }

  const hasDraftInProgress = entries.some((entry) => !entry.confirmed);
  const confirmedCount = entries.filter((entry) => entry.confirmed).length;

  // Every confirmed operation whose input dynamically references another one's result — drawn
  // as a connecting line between the two nodes (see edgePath) instead of nesting one inside the
  // other's DOM, since both need to stay independently draggable on the canvas.
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const edges: Edge[] = entries.flatMap((entry) => {
    if (!entry.confirmed) return [];
    return getInputSources(entry.fields).flatMap((source) => {
      if (source.type !== 'reference') return [];
      const from = entriesById.get(source.operationId);
      if (!from) return [];
      return [{ fromId: from.id, toId: entry.id, from: from.position, to: entry.position }];
    });
  });

  // The edit panel's own confirm ("Atualizar operação" — see renderDraftCard's 'edit' mode) —
  // pins the entry's highlight so it's what shows next time the sheet panel opens (a reveal
  // click, or "Ver dados") without needing to hover first, and reports the confirm so App.tsx can
  // close the sheet panel. Staging has no equivalent per-card confirm — see confirmAllStaged.
  function confirmEdit(entry: OperationEntryState) {
    updateEntry(entry.id, { confirmed: true });
    setSelectedOperationId(entry.id);
    onOperationConfirmed();
  }

  /**
   * 'edit' (reopened via "Editar" — see editEntry) gets its own confirm button ("Atualizar
   * operação"), since it's editing one single already-existing operation on its own. 'stage' (a
   * batch being prepared before "Adicionar todos os operadores" — see renderConfigPanel) has no
   * per-card button at all — adding another to the batch and confirming the whole batch are both
   * controls shared across every staged card, rendered once by renderConfigPanel itself rather
   * than duplicated on each one.
   */
  function renderDraftCard(entry: OperationEntryState, mode: 'edit' | 'stage') {
    const kind = KINDS_BY_ID[entry.kindId];
    return (
      <DraftOperationCard
        name={entry.name}
        onNameChange={(name) => updateEntry(entry.id, { name })}
        canConfirm={kind.canConfirm(entry.fields)}
        confirmLabel={mode === 'edit' ? 'Atualizar operação' : undefined}
        onConfirm={mode === 'edit' ? () => confirmEdit(entry) : undefined}
      >
        {kind.renderDraftConfig({
          dataset,
          entryId: entry.id,
          fields: entry.fields,
          updateFields: (patch) => updateEntryFields(entry.id, patch),
          columnPick,
          onStartColumnPick,
          onFinishColumnPick,
          rangePick,
          onStartRangePick,
          onFinishRangePick,
        })}
      </DraftOperationCard>
    );
  }

  // Which sheet a confirmed entry's own highlight lives on — read off whichever highlight kind
  // it actually produces, since kinds don't expose a "sheetIndex" field directly (see
  // operationKind.ts). Always defined once an entry can be confirmed at all (both kinds require
  // a table to be picked before a column/range can be).
  function sheetIndexForEntry(entry: OperationEntryState): number | null {
    const kind = KINDS_BY_ID[entry.kindId];
    const [firstColumn] = kind.getColumnHighlights(entry.fields);
    if (firstColumn) return firstColumn.sheetIndex;
    const [firstRange] = kind.getRangeHighlights?.(entry.fields) ?? [];
    return firstRange ? firstRange.sheetIndex : null;
  }

  function revealEntry(entry: OperationEntryState) {
    setSelectedOperationId(entry.id);
    const sheetIndex = sheetIndexForEntry(entry);
    if (sheetIndex !== null) {
      onRevealInSheet(sheetIndex);
    }
  }

  function renderConfirmedCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    const isModelInputEligible = Boolean(kind.renderInputEditor) && getInputSource(entry.fields).type === 'literal';

    return (
      <ConfirmedOperationCard
        name={entry.name}
        kindLabel={labelForKind(entry.kindId)}
        summary={kind.renderSummary(entry.fields, dataset)}
        onEdit={() => editEntry(entry.id)}
        editDisabled={hasDraftInProgress}
        onMouseEnter={() => setHoveredOperationId(entry.id)}
        onMouseLeave={() => setHoveredOperationId((current) => (current === entry.id ? null : current))}
        isTested={(testSignals[entry.id] ?? 0) > 0}
        onTestUpToHere={() => runModelTest(entry.id)}
        onReveal={() => revealEntry(entry)}
        isRevealEligible={sheetIndexForEntry(entry) !== null}
        isModelInput={modelInputIds.includes(entry.id)}
        isModelInputEligible={isModelInputEligible}
        onToggleModelInput={() => {
          const turningOn = !modelInputIds.includes(entry.id);
          onModelInputIdsChange(
            turningOn ? [...modelInputIds, entry.id] : modelInputIds.filter((id) => id !== entry.id),
          );
          // Clears whatever literal value was typed in while just testing this operation locally
          // (see ValueSourceField's disabled note) — otherwise that leftover value would still be
          // exported with the model and show up pre-filled the next time it's utilized, instead
          // of the blank field a caller is meant to fill in themselves (see ModelCard).
          if (turningOn) {
            updateEntryFields(entry.id, { input: literalSource('') });
          }
        }}
        isModelOutput={modelOutputIds.includes(entry.id)}
        onToggleModelOutput={() =>
          onModelOutputIdsChange(
            modelOutputIds.includes(entry.id) ? modelOutputIds.filter((id) => id !== entry.id) : [...modelOutputIds, entry.id],
          )
        }
        isModalOpen={modalEntryId === entry.id}
        onCloseModal={() => setModalEntryId((current) => (current === entry.id ? null : current))}
      >
        {kind.renderBody({
          fields: entry.fields,
          updateFields: (patch) => updateEntryFields(entry.id, patch),
          datasetId: dataset.datasetId,
          onMatchChange: (rowIndex) => setMatchedRows((current) => ({ ...current, [entry.id]: rowIndex })),
          resolvedInput: resolvedInputsByEntry[entry.id][0],
          resolvedInputs: resolvedInputsByEntry[entry.id],
          referenceOptions: referenceOptionsFor(entry.id),
          onResultChange: (value) => setResults((current) => ({ ...current, [entry.id]: value })),
          testSignal: testSignals[entry.id] ?? 0,
          resetSignal,
        })}
      </ConfirmedOperationCard>
    );
  }

  // Building a new operation ("+ Adicionar operação") and editing an existing one (the pencil on
  // a confirmed node) both go through the same two steps: for a new operation, pick a kind first
  // (a small centered modal, see AddOperationModal); either way, the draft config itself (name,
  // table, columns/range, confirm/delete/cancel — the same DraftOperationCard rendered on the
  // canvas before this change) is hosted in a panel docked to the left, not on the canvas and not
  // a centered/blocking dialog — picking a column/range auto-opens the off-canvas sheet panel on
  // the right (see App.tsx), and a full-screen backdrop would sit on top of it, making the sheet
  // unreachable.
  function renderConfigPanel(): ReactNode {
    if (editingEntryId) {
      const editingEntry = entries.find((entry) => entry.id === editingEntryId);
      if (!editingEntry) return null;

      return (
        <div className="add-operation-panel" role="dialog" aria-modal="true" aria-labelledby="add-operation-panel-title">
          <div className="add-operation-panel__header">
            <h2 id="add-operation-panel-title" className="add-operation-panel__title">
              Editar operação
            </h2>
            <button
              type="button"
              className="add-operation-panel__close"
              onClick={() => cancelEntry(editingEntry.id)}
              aria-label="Cancelar"
            >
              ×
            </button>
          </div>
          <div className="add-operation-panel__body">{renderDraftCard(editingEntry, 'edit')}</div>
        </div>
      );
    }

    if (stagingEntryIds.length > 0) {
      // Same order they were added in (stagingEntryIds), not entries' own order — entries also
      // holds every already-confirmed operation, interleaved however addToStaging's own
      // current.length-based placement (see createEntry) happened to land them. A batch is always
      // a single kind — the kind picked to start it (see the fallback branch below) — so every
      // staged entry here shares stagingEntries[0]'s own kindId.
      const stagingEntries = stagingEntryIds
        .map((id) => entries.find((entry) => entry.id === id))
        .filter((entry): entry is OperationEntryState => entry !== undefined);
      const canConfirmAllStaged = stagingEntries.every((entry) => KINDS_BY_ID[entry.kindId].canConfirm(entry.fields));
      const stagingKindId = stagingEntries[0]?.kindId;

      return (
        <div className="add-operation-panel" role="dialog" aria-modal="true" aria-labelledby="add-operation-panel-title">
          <div className="add-operation-panel__header">
            <h2 id="add-operation-panel-title" className="add-operation-panel__title">
              {stagingKindId ? `Novas operações: ${labelForKind(stagingKindId)}` : 'Novas operações'}
            </h2>
            <button type="button" className="add-operation-panel__close" onClick={cancelStaging} aria-label="Cancelar">
              ×
            </button>
          </div>
          <div className="add-operation-panel__body">
            {/* Each staged card gets its own × to drop just that one from the batch (see
                removeFromStaging) — separate from the panel's own × above, which discards the
                whole batch. None of them have their own confirm button (see renderDraftCard's
                'stage' mode) — adding to the batch and confirming it are both shared across every
                staged card at once (the "+" right after them, and the footer below), not
                duplicated on each one. */}
            {stagingEntries.map((entry) => (
              <div key={entry.id} className="add-operation-panel__staged-card">
                <button
                  type="button"
                  className="add-operation-panel__staged-card-remove"
                  onClick={() => removeFromStaging(entry.id)}
                  aria-label="Remover esta operação do lote"
                  title="Remover esta operação do lote"
                >
                  ×
                </button>
                {renderDraftCard(entry, 'stage')}
              </div>
            ))}
            {/* Adds another of the same kind the batch was started with, right after the ones
                already chosen — a batch is always one kind (see stagingKindId above), so this
                skips the kind picker entirely rather than asking again for something already
                decided. */}
            {stagingKindId && (
              <button
                type="button"
                className="add-operation-panel__add-more"
                onClick={() => addToStaging(stagingKindId)}
                aria-label={`Adicionar outra operação ${labelForKind(stagingKindId)}`}
                title={`Adicionar outra operação ${labelForKind(stagingKindId)}`}
              >
                +
              </button>
            )}
          </div>
          <div className="add-operation-panel__footer">
            <button
              type="button"
              className="add-operation-panel__confirm-all"
              onClick={confirmAllStaged}
              disabled={!canConfirmAllStaged}
              title={canConfirmAllStaged ? undefined : 'Complete todas as operações antes de as adicionar.'}
            >
              {stagingEntries.length === 1 ? 'Adicionar operador' : `Adicionar ${stagingEntries.length} operadores`}
            </button>
          </div>
        </div>
      );
    }

    return (
      <AddOperationModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        kinds={KINDS.map((kind) => ({ id: kind.id, label: labelForKind(kind.id) }))}
        onPick={addToStaging}
      />
    );
  }

  return (
    <div className="operation-canvas">
      <div className="operation-canvas__toolbar">
        <button
          type="button"
          className="operation-canvas__add-button"
          onClick={() => setIsAddModalOpen(true)}
          disabled={hasDraftInProgress}
          title={hasDraftInProgress ? 'Termine a operação em curso antes de criar outra.' : undefined}
        >
          + Adicionar operação
        </button>
        <span className="operation-canvas__count">
          Operações <span className="operation-panel__count">{confirmedCount}</span>
        </span>
        <div className="operation-canvas__toolbar-actions">
          <div className="operation-canvas__zoom-controls">
            <button
              type="button"
              className="operation-canvas__zoom-button"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
            >
              −
            </button>
            <button
              type="button"
              className="operation-canvas__zoom-level"
              onClick={() => zoomBy(1 / zoom)}
              disabled={zoom === 1}
              title="Repor zoom para 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="operation-canvas__zoom-button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={
              tool === 'select'
                ? 'operation-canvas__tool-button operation-canvas__tool-button--active'
                : 'operation-canvas__tool-button'
            }
            onClick={() => {
              setTool((current) => {
                const next = current === 'select' ? 'pan' : 'select';
                if (next !== 'select') setSelectedIds([]);
                return next;
              });
            }}
            title={tool === 'select' ? 'Voltar a arrastar o fundo para mover a vista.' : 'Arrastar sobre o fundo para selecionar várias operações.'}
          >
            Selecionar
          </button>
          <button
            type="button"
            className={
              pendingPaste ? 'operation-canvas__paste-button operation-canvas__paste-button--active' : 'operation-canvas__paste-button'
            }
            onClick={() => setPendingPaste((current) => !current)}
            disabled={!clipboard || clipboard.length === 0}
            title={
              !clipboard || clipboard.length === 0
                ? 'Copie uma ou mais operações primeiro.'
                : pendingPaste
                  ? 'Clique no canvas para colar aqui — ou clique de novo aqui para cancelar.'
                  : 'Cola as operações copiadas onde clicar no canvas.'
            }
          >
            {pendingPaste ? 'Clique no canvas para colar…' : 'Colar'}
          </button>
          <button
            type="button"
            className="operation-canvas__reset-button"
            onClick={() => {
              cancelPendingTestStagger();
              setResetSignal((current) => current + 1);
              // Also clears every card's own "tested" border (see isTested/operation-card--tested)
              // and re-disables this same button — nothing's actually been tested any more once
              // its results are cleared.
              setTestSignals({});
              setHasTested(false);
            }}
            disabled={!hasTested}
            title={!hasTested ? 'Ainda não testou o modelo.' : 'Limpa os resultados do último teste.'}
          >
            Limpar teste
          </button>
          <button
            type="button"
            className={
              testProgress
                ? 'operation-canvas__test-button operation-canvas__test-button--cancel'
                : 'operation-canvas__test-button'
            }
            // Opens TestValuesModal to review/adjust each designated input's value (already
            // filled in from whatever's currently set — typed on canvas, or loaded via "Importar
            // teste") before running, same as before; runs immediately if there's nothing to
            // review (no designated input at all). While a stagger's in progress, this same
            // button interrupts it instead — cancelPendingTestStagger just stops whatever hasn't
            // fired yet (already-dispatched requests still run to completion; there's no
            // cancelling those without an AbortController this app doesn't otherwise need).
            onClick={() => {
              if (testProgress) {
                cancelPendingTestStagger();
              } else if (testInputEntries.length > 0) {
                openTestModal();
              } else {
                runModelTest();
              }
            }}
            disabled={confirmedCount === 0}
            title={
              testProgress
                ? `Interrompe o teste (${testProgress.done}/${testProgress.total}) — para de calcular as operações que ainda faltam.`
                : confirmedCount === 0
                  ? 'Conclua pelo menos uma operação para a poder testar.'
                  : testInputEntries.length > 0
                    ? 'Reveja os valores de cada input antes de correr o teste.'
                    : 'Calcula cada operação com os valores atuais.'
            }
          >
            {/* The progress fill lives on the button itself instead of a separate bar elsewhere
                on the canvas — one less element to place, and it's right where the user's
                attention already is (they just clicked this). Absolutely positioned under the
                label (z-index), growing left to right as testProgress advances. */}
            {testProgress && (
              <span
                className="operation-canvas__test-button-progress"
                style={{ width: `${(testProgress.done / testProgress.total) * 100}%` }}
              />
            )}
            <span className="operation-canvas__test-button-label">{testProgress ? 'Cancelar teste' : 'Testar modelo'}</span>
          </button>
          <input
            ref={testFileInputRef}
            type="file"
            accept="application/json"
            className="operation-canvas__test-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ''; // so re-importing the same file path fires onChange again
              if (file) loadTestCase(file);
            }}
          />
          <button
            type="button"
            className="operation-canvas__test-io-button"
            onClick={triggerImportTest}
            disabled={testInputEntries.length === 0}
            title={testInputEntries.length === 0 ? 'O modelo não tem nenhum input definido.' : 'Preenche os inputs a partir de um ficheiro JSON.'}
          >
            Importar teste
          </button>
        </div>
      </div>

      {testLoadError && <p className="operation-canvas__test-load-error">{testLoadError}</p>}

      {tool === 'select' && selectedIds.length > 0 && (
        <div className="operation-canvas__selection-bar">
          <span className="operation-canvas__selection-count">
            {selectedIds.length} {selectedIds.length === 1 ? 'operação selecionada' : 'operações selecionadas'}
          </span>
          <div className="operation-canvas__selection-actions">
            <button type="button" className="operation-canvas__selection-button" onClick={copySelection}>
              Copiar
            </button>
            <button
              type="button"
              className="operation-canvas__selection-button operation-canvas__selection-button--danger"
              onClick={deleteSelection}
            >
              Eliminar
            </button>
            <button type="button" className="operation-canvas__selection-button" onClick={() => setSelectedIds([])}>
              Cancelar seleção
            </button>
          </div>
        </div>
      )}

      <div
        ref={viewportRef}
        className={[
          'operation-canvas__viewport',
          pan ? 'operation-canvas__viewport--panning' : '',
          tool === 'select' ? 'operation-canvas__viewport--select' : '',
          pendingPaste ? 'operation-canvas__viewport--placing' : '',
          // Nothing on the canvas — panning, dragging/editing a node, marquee-selecting — should
          // be touchable while a test is staggering through the model's operations: an edit
          // mid-test would leave a still-running test computing against fields that have since
          // changed underneath it.
          testProgress ? 'operation-canvas__viewport--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={testProgress ? undefined : handleViewportMouseDown}
        onClick={testProgress ? undefined : handleViewportClick}
        onWheel={testProgress ? undefined : handleViewportWheel}
        // Keeps the dotted grid (see OperationPanel.css) moving and scaling together with the
        // surface below, instead of staying fixed to the viewport while the nodes on it pan/zoom
        // past — its phase follows the same unscaled viewOffset the surface's own translate uses
        // (see the surface's transform below), and its dot spacing scales by the same zoom.
        style={{
          backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px`,
          backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
        }}
      >
        <div
          className="operation-canvas__surface"
          // translate() is applied in real screen pixels, outside the scale — panning always
          // tracks the cursor 1:1 regardless of zoom (see zoomBy's own comment for why scale
          // needs a transform-origin of 0 0, set in CSS, to keep its math this simple).
          style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})` }}
        >
          <svg className="operation-canvas__edges">
            {edges.map((edge, index) => (
              <path key={`${edge.fromId}-${edge.toId}-${index}`} d={edgePath(edge)} />
            ))}
          </svg>

          {entries.map((entry) => {
            // Being edited, or staged as part of a new-operation batch, in the config panel right
            // now (see renderConfigPanel) — hidden from the canvas until it's confirmed there.
            if (entry.id === editingEntryId || stagingEntryIds.includes(entry.id)) return null;

            return (
              <div
                key={entry.id}
                ref={(el) => {
                  nodeRefs.current[entry.id] = el;
                }}
                className={
                  selectedIds.includes(entry.id) ? 'operation-canvas__node operation-canvas__node--selected' : 'operation-canvas__node'
                }
                style={{ left: entry.position.x, top: entry.position.y, width: NODE_WIDTH, zIndex: nodeZIndex[entry.id] }}
                onMouseDown={startNodeDrag(entry.id, entry.position)}
              >
                {/* Unreachable in practice: an unconfirmed entry is always either the one being
                    edited or part of the current staging batch, both filtered out above — this
                    branch only exists so TypeScript doesn't need entry.confirmed narrowed further. */}
                {entry.confirmed ? renderConfirmedCard(entry) : renderDraftCard(entry, 'stage')}
                {/* In "select" mode, a transparent overlay sits in front of the whole card,
                    intercepting every click before it reaches the card's own controls (Input/
                    Output toggles, edit, reveal, the live value field, ...) — selecting or moving
                    a node is all that's meant to be possible here; editing it is what "pan" mode
                    (and the pencil, once back there) is for. startNodeDrag's own form-control
                    bypass (see below) never needs to trigger here since the overlay itself, not
                    any inner control, is always what's actually clicked. */}
                {tool === 'select' && <div className="operation-canvas__node-overlay" onMouseDown={startNodeDrag(entry.id, entry.position)} />}
              </div>
            );
          })}
        </div>
      </div>

      {marqueeRect && (
        <div
          className="operation-canvas__marquee"
          style={{ left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height }}
        />
      )}

      {renderConfigPanel()}

      <TestValuesModal
        open={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        inputs={testInputEntries}
        onChangeValue={updateTestValue}
        onRun={runTestFromModal}
      />
    </div>
  );
}
