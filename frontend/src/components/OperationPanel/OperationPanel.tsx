import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, getInputSources, literalSource, remapValueSourceReferences } from '../../types/valueSource';
import type { SerializableEntry } from '../../utils/modelSerialization';
import type { OperationFields, ReferenceOption } from './operationKind';
import { KINDS, KINDS_BY_ID } from './kinds/registry';
import { AddOperationModal } from '../AddOperationModal/AddOperationModal';
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

/** A node's position on the canvas surface, in canvas-local pixels (unaffected by panning). */
interface NodePosition {
  x: number;
  y: number;
}

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

/** How far the canvas can be zoomed out/in, and the multiplicative step each zoom-in/zoom-out
 * click (or wheel notch — see handleViewportWheel) applies. Multiplicative rather than additive so
 * repeated clicks feel like a consistent proportional change at any zoom level, not a fixed pixel
 * amount that feels huge when zoomed out and tiny when zoomed in. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.2;

/** Simple cascading grid placement for a newly created/imported node — nothing persisted, just
 * a reasonable starting point; the user drags nodes wherever they actually want them. */
function placementFor(index: number): NodePosition {
  const column = index % NODES_PER_ROW;
  const row = Math.floor(index / NODES_PER_ROW);
  return { x: 40 + column * NODE_COLUMN_GAP, y: 40 + row * NODE_ROW_GAP };
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
    <div className="operation-card" ref={cardRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          {isModelInputEligible && <IoToggle label="Input" active={isModelInput} onToggle={onToggleModelInput} />}
          <IoToggle label="Output" active={isModelOutput} onToggle={onToggleModelOutput} />
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
function createEntry(id: string, kindId: string, name: string, dataset: DatasetImportResponse, placementIndex: number): OperationEntryState {
  return {
    id,
    name,
    kindId,
    confirmed: false,
    fields: KINDS_BY_ID[kindId].createFields(dataset),
    position: placementFor(placementIndex),
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

/** An in-progress canvas pan (dragging empty canvas background) or node drag: the pointer
 * position where the drag started, and the position being dragged from at that point. */
interface DragState {
  id: string | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/** The pointer position (in screen/client pixels, not canvas-local ones — see the marquee-drag
 * effect below) a select-mode marquee drag started at — stable for the whole drag, same as
 * DragState above; only its endpoint moves, tracked separately in MarqueeRect so the drag's own
 * effect doesn't need to re-subscribe on every pointer move. */
interface MarqueeStart {
  x: number;
  y: number;
}

/** The marquee's current on-screen box, recomputed from MarqueeStart and the latest pointer
 * position on every move — purely for drawing the selection rectangle; the hit-test against nodes
 * only happens once, on mouseup (see the effect below). */
interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
  // Bumped by "Testar modelo" (see the toolbar below) — passed through to every kind's
  // renderBody (see operationKind.ts) as the one signal that should make it actually call its
  // endpoint, instead of every result live-fetching as soon as its inputs are ready.
  const [testSignal, setTestSignal] = useState(0);
  // Bumped by "Limpar teste" — the counterpart to testSignal: clears every kind's shown result
  // back to not-tested without needing to change any of its fields first.
  const [resetSignal, setResetSignal] = useState(0);
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

  // The canvas' pan offset (dragging empty background) and, independently, a node being dragged
  // — see the window-level listener effect below. Both are plain pointer-delta math, no library.
  const [viewOffset, setViewOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const [pan, setPan] = useState<DragState | null>(null);
  const [dragNode, setDragNode] = useState<DragState | null>(null);
  // The canvas' zoom level, 1 = 100% — applied to the same surface viewOffset already pans (see
  // zoomBy and the transform in the JSX below), so panning and zooming compose naturally instead
  // of needing two separate transformed layers.
  const [zoom, setZoom] = useState(1);

  // Which canvas tool is active: "pan" (default) drags the background to scroll the canvas,
  // "select" instead drags a marquee to bulk-select nodes (see the toolbar toggle and the marquee
  // effect below). Switching away from "select" drops whatever was selected — a leftover
  // selection would otherwise linger, invisible, back in "pan" mode.
  const [tool, setTool] = useState<'pan' | 'select'>('pan');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marqueeStart, setMarqueeStart] = useState<MarqueeStart | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  // Copied operations, kept purely in memory (nothing persisted, same as everything else on this
  // canvas) — see copySelection/pasteClipboardAt. Cleared only by copying again, never by pasting,
  // so the same copy can be pasted more than once.
  const [clipboard, setClipboard] = useState<OperationEntryState[] | null>(null);
  // True once "Colar" has been clicked and is waiting for the placement click on the canvas (see
  // handleViewportClick) — lets the user choose where the pasted copy lands instead of it always
  // dropping on top of the original, which would bury it under (or overlapping) the rest of the
  // model.
  const [pendingPaste, setPendingPaste] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Each rendered node's DOM element, keyed by entry id — read only on marquee mouseup, to hit-test
  // its actual on-screen box (including however tall its live result/body currently renders) against
  // the marquee rectangle. A stale entry for a since-deleted id is harmless (see removeEntry, which
  // still deletes it for tidiness) since nothing ever looks it up again.
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Each node's stacking order, keyed by entry id — bumped (see bringToFront) whenever a node is
  // dragged, clicked into, or expanded, so it renders above every other node instead of staying
  // stuck under whichever ones happen to come later in `entries` (plain DOM order otherwise, since
  // .operation-canvas__node itself sets no z-index). Absent entries fall back to CSS's implicit
  // stacking (DOM order), so a node never needs touching here until it's actually interacted with.
  const [nodeZIndex, setNodeZIndex] = useState<Record<string, number>>({});
  const nodeZIndexCounter = useRef(0);

  function bringToFront(id: string) {
    nodeZIndexCounter.current += 1;
    setNodeZIndex((current) => ({ ...current, [id]: nodeZIndexCounter.current }));
  }

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

  // Drives both canvas panning and node dragging: a single pointer-move/up listener registered
  // only while one of the two is active (mirrors SheetViewer's range-drag-select pattern), so a
  // release outside the canvas still ends the drag instead of leaving it stuck.
  useLayoutEffect(() => {
    if (!pan && !dragNode) return;

    function handleMouseMove(event: globalThis.MouseEvent) {
      if (pan) {
        setViewOffset({ x: pan.originX + (event.clientX - pan.startX), y: pan.originY + (event.clientY - pan.startY) });
      }
      if (dragNode) {
        // Node positions live in the surface's own pre-zoom coordinate space (see the transform
        // in the JSX below) while the pointer delta is measured in real screen pixels — dividing
        // by zoom converts the latter into the former, so a node tracks the cursor 1:1 on screen
        // at any zoom level instead of drifting faster than the cursor while zoomed in (or slower
        // while zoomed out). Uses whatever zoom was active when this drag started (see the
        // dep-array note below) — changing zoom mid-drag (e.g. via the wheel) isn't accounted for.
        const nextPosition = {
          x: dragNode.originX + (event.clientX - dragNode.startX) / zoom,
          y: dragNode.originY + (event.clientY - dragNode.startY) / zoom,
        };
        setEntries((current) =>
          current.map((entry) => (entry.id === dragNode.id ? { ...entry, position: nextPosition } : entry)),
        );
      }
    }

    function handleMouseUp(event: globalThis.MouseEvent) {
      // A node "drag" that barely moved is really a click — in "select" mode that toggles the
      // node's selection; otherwise (plain "pan" mode) it opens that node's detail modal (see
      // ConfirmedOperationCard) instead. A real pan/drag (movement past the threshold) never
      // triggers either — only startNodeDrag's own form-control bypass (mousedown on a button/
      // input inside the card) leaves dragNode unset here, so a click on those still reaches the
      // control itself rather than opening the modal.
      if (dragNode?.id) {
        const movedDistance = Math.hypot(event.clientX - dragNode.startX, event.clientY - dragNode.startY);
        if (movedDistance < 4) {
          const nodeId = dragNode.id;
          if (tool === 'select') {
            setSelectedIds((current) => (current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]));
          } else {
            setModalEntryId(nodeId);
          }
        }
      }
      setPan(null);
      setDragNode(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // pan/dragNode only ever change at the start (mousedown) and end (mouseup) of a drag, never
    // mid-drag — safe to depend on just these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, dragNode]);

  // The marquee-select counterpart of the pan/node-drag effect above, kept separate since it
  // drives its own bit of state (the selection) instead of viewOffset/entries — same shape
  // otherwise: marqueeStart is set once on mousedown and cleared on mouseup, never touched
  // mid-drag, so depending on just it (not the constantly-updating marqueeRect) is safe, same
  // reasoning as pan/dragNode above.
  useLayoutEffect(() => {
    if (!marqueeStart) return;

    function handleMouseMove(event: globalThis.MouseEvent) {
      setMarqueeRect({
        left: Math.min(marqueeStart!.x, event.clientX),
        top: Math.min(marqueeStart!.y, event.clientY),
        width: Math.abs(event.clientX - marqueeStart!.x),
        height: Math.abs(event.clientY - marqueeStart!.y),
      });
    }

    function handleMouseUp(event: globalThis.MouseEvent) {
      const left = Math.min(marqueeStart!.x, event.clientX);
      const right = Math.max(marqueeStart!.x, event.clientX);
      const top = Math.min(marqueeStart!.y, event.clientY);
      const bottom = Math.max(marqueeStart!.y, event.clientY);

      // Any confirmed node whose on-screen box (read straight off the DOM, so it reflects
      // whatever it's actually rendering right now — a longer result, an expanded field, ...)
      // overlaps the dragged rectangle at all becomes the new selection, replacing whatever was
      // selected before. A plain click (no real drag) hits nothing and clears the selection.
      const hits = entries
        .filter((entry) => entry.confirmed)
        .filter((entry) => {
          const el = nodeRefs.current[entry.id];
          if (!el) return false;
          const box = el.getBoundingClientRect();
          return box.left < right && box.right > left && box.top < bottom && box.bottom > top;
        })
        .map((entry) => entry.id);
      setSelectedIds(hits);
      setMarqueeStart(null);
      setMarqueeRect(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marqueeStart]);

  function startPan(event: ReactMouseEvent<HTMLDivElement>) {
    // Only ever reaches here for a mousedown on empty canvas background — a node's own
    // mousedown handler (see startNodeDrag) stops propagation before it would bubble up here.
    event.preventDefault();
    setPan({ id: null, startX: event.clientX, startY: event.clientY, originX: viewOffset.x, originY: viewOffset.y });
  }

  function startMarquee(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setMarqueeStart({ x: event.clientX, y: event.clientY });
    setMarqueeRect({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
  }

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

  // Zooms toward/away from a focal point (in screen coordinates — the cursor for a wheel notch,
  // or the viewport's own center for a toolbar +/− click, which has no cursor position of its own
  // to zoom around) while keeping whatever's currently under that point visually still, the same
  // way most other canvas/map tools zoom: solved by picking a new viewOffset such that the
  // surface-local point the focal point currently maps to (given the old zoom/viewOffset) still
  // maps to that exact same screen position under the new zoom.
  function zoomBy(factor: number, focal?: { clientX: number; clientY: number }) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (nextZoom === zoom) return;

    const viewportBox = viewportRef.current?.getBoundingClientRect();
    if (viewportBox) {
      const focalX = (focal?.clientX ?? viewportBox.left + viewportBox.width / 2) - viewportBox.left;
      const focalY = (focal?.clientY ?? viewportBox.top + viewportBox.height / 2) - viewportBox.top;
      setViewOffset({
        x: focalX - (nextZoom / zoom) * (focalX - viewOffset.x),
        y: focalY - (nextZoom / zoom) * (focalY - viewOffset.y),
      });
    }
    setZoom(nextZoom);
  }

  // Ctrl/Cmd+wheel (a trackpad pinch is reported as this by the browser) zooms the canvas around
  // the cursor; a plain wheel is left alone (does nothing — the viewport has nothing to scroll,
  // and reserving plain wheel for zoom too would make it too easy to zoom by accident while just
  // moving the mouse across the canvas with a scroll wheel resting under the cursor).
  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { clientX: event.clientX, clientY: event.clientY });
  }

  function startNodeDrag(entry: OperationEntryState) {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      // Bring the node to front on any interaction with it — dragging, clicking a control inside
      // it, or selecting it — so it's never left rendered underneath other nodes it overlaps
      // (plain DOM/entries order otherwise, since .operation-canvas__node itself sets no z-index).
      bringToFront(entry.id);
      // Let a form control inside the node (the lookup query input, a select, a button, ...)
      // handle its own click/focus instead of hijacking it into a node drag — preventDefault on
      // mousedown suppresses the browser's default "focus this element" behavior, which made it
      // impossible to click into a text field and type. Still stopPropagation so the click
      // doesn't also bubble up and start a canvas pan.
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button')) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDragNode({ id: entry.id, startX: event.clientX, startY: event.clientY, originX: entry.position.x, originY: entry.position.y });
    };
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
    delete nodeRefs.current[id];
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

  // Picking a kind in the add modal (starting a fresh batch) or clicking a staged card's own "+"
  // (see DraftOperationCard's onAddAnotherOfSameKind, adding another of the same kind to the
  // current one) both add to the same staging batch — the new draft doesn't appear on the canvas
  // until the whole batch is confirmed at once (see confirmAllStaged below), unlike editEntry's
  // single entry, which confirms (and closes the panel) on its own.
  function addToStaging(kindId: string) {
    const label = labelForKind(kindId);
    const id = generateEntryId();
    setEntries((current) => {
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(id, kindId, `${label} ${order}`, dataset, current.length)];
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
          testSignal,
          resetSignal,
          isModelInput: modelInputIds.includes(entry.id),
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
            onClick={() => setResetSignal((current) => current + 1)}
            disabled={testSignal === 0}
            title={testSignal === 0 ? 'Ainda não testou o modelo.' : 'Limpa os resultados do último teste.'}
          >
            Limpar teste
          </button>
          <button
            type="button"
            className="operation-canvas__test-button"
            onClick={() => setTestSignal((current) => current + 1)}
            disabled={confirmedCount === 0}
            title={confirmedCount === 0 ? 'Conclua pelo menos uma operação para a poder testar.' : 'Calcula cada operação com os valores atuais.'}
          >
            Testar modelo
          </button>
        </div>
      </div>

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
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={handleViewportMouseDown}
        onClick={handleViewportClick}
        onWheel={handleViewportWheel}
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
                onMouseDown={startNodeDrag(entry)}
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
                {tool === 'select' && <div className="operation-canvas__node-overlay" onMouseDown={startNodeDrag(entry)} />}
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
    </div>
  );
}
