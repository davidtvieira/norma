import { useEffect, useLayoutEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, getInputSources } from '../../types/valueSource';
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
/** Vertical offset from a node's top to its header's center — where edges attach — constant
 * regardless of how tall the node's body grows (result text, expanded info, ...). */
const NODE_HEADER_ANCHOR_Y = 28;
const NODES_PER_ROW = 3;
const NODE_COLUMN_GAP = 340;
const NODE_ROW_GAP = 240;

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
  onConfirm: () => void;
  onDelete: () => void;
  children: ReactNode;
}

/**
 * An operation being built or edited: name, then whatever type-specific config the kind renders
 * as `children`, then confirm/delete once ready. Always shown inside the config panel (see
 * OperationPanel's renderConfigPanel), whose own × already cancels — reverting an edit back to
 * its confirmed state, or deleting a never-confirmed draft — so there's no second one here.
 */
function DraftOperationCard({ name, onNameChange, canConfirm, onConfirm, onDelete, children }: DraftOperationCardProps) {
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

      {canConfirm && (
        <div className="operation-entry__confirm-row">
          <button type="button" className="operation-entry__confirm-button" onClick={onConfirm}>
            Concluir operação
          </button>
          <button type="button" className="operation-entry__delete-button" onClick={onDelete}>
            Remover operação
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
  /** e.g. "Pesquisa aninhada"/"Somar" — shown in the footer, under the live input/result. */
  kindLabel: string;
  /** The "which table/columns/range" detail (see operationKind.ts's renderSummary) — shown next
   * to kindLabel in the footer. */
  summary: ReactNode;
  onEdit: () => void;
  editDisabled: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onReveal: () => void;
  children: ReactNode;
  isModelInput: boolean;
  isModelInputEligible: boolean;
  onToggleModelInput: () => void;
  isModelOutput: boolean;
  onToggleModelOutput: () => void;
}

/**
 * A confirmed operation node: name + model input/output toggles + reveal-in-sheet + edit
 * (pencil, reopens it as a draft), then whatever type-specific input/result the kind renders as
 * `children`, then a footer naming its type and which table/columns/range it's set up against.
 * Hover drives that kind's sheet highlight while the card is under the mouse; clicking the reveal
 * button pins that same highlight and opens the sheet panel to actually show it (see
 * OperationPanel's onRevealInSheet).
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
  children,
  isModelInput,
  isModelInputEligible,
  onToggleModelInput,
  isModelOutput,
  onToggleModelOutput,
}: ConfirmedOperationCardProps) {
  return (
    <div className="operation-card" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          {isModelInputEligible && <IoToggle label="Input" active={isModelInput} onToggle={onToggleModelInput} />}
          <IoToggle label="Output" active={isModelOutput} onToggle={onToggleModelOutput} />
          <RevealButton onReveal={onReveal} />
          <EditButton onEdit={onEdit} disabled={editDisabled} />
        </div>
      </div>

      {children}

      <div className="operation-card__footer">
        <span className="operation-card__kind">{kindLabel}</span>
        <span className="operation-card__summary">{summary}</span>
      </div>
    </div>
  );
}

// Overrides the API's (English) labels with their Portuguese display names — the id is still
// what's sent to/matched against the API, only the label shown in the UI is translated here.
const KIND_LABELS: Record<string, string> = { lookup: 'Pesquisa aninhada', sum: 'Somar', counter: 'Contador', node: 'Nó' };

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
  /** Seeds the entry list on mount (e.g. a model just imported on the previous screen). Node
   * positions aren't part of the exported model, so every seeded entry gets a fresh cascading
   * placement (see placementFor) rather than restoring one. */
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
    (initialEntries ?? []).map((entry, index) => ({ ...entry, position: placementFor(index) })),
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
  // The entry currently being built or edited in the left-docked config panel (see
  // renderConfigPanel) instead of on the canvas — set once a kind is picked ("+ Adicionar
  // operação") or an existing node's edit (pencil) is opened, cleared once the entry is
  // confirmed or removed (see the effect below). Both flows share the same panel and the same
  // DraftOperationCard.
  const [configuringEntryId, setConfiguringEntryId] = useState<string | null>(null);
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

  // Lets App.tsx export the model (see the "Guardar modelo" flow) without entries living there.
  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  // Closes the config panel once the entry it was building/editing resolves — confirmed (it now
  // shows, or goes back to showing, on the canvas at its already-assigned position) or removed
  // (× cancels a fresh draft by deleting it, or reverts an edit back to its confirmed snapshot —
  // see cancelEntry — either way `confirmed` ends up true again; "Remover operação" deletes it
  // outright). Driven by `entries` rather than the panel's own buttons so every way that entry
  // can resolve is covered by one place.
  useEffect(() => {
    if (!configuringEntryId) return;
    const entry = entries.find((item) => item.id === configuringEntryId);
    if (!entry || entry.confirmed) {
      setConfiguringEntryId(null);
      setIsAddModalOpen(false);
    }
  }, [entries, configuringEntryId]);

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
        const nextPosition = {
          x: dragNode.originX + (event.clientX - dragNode.startX),
          y: dragNode.originY + (event.clientY - dragNode.startY),
        };
        setEntries((current) =>
          current.map((entry) => (entry.id === dragNode.id ? { ...entry, position: nextPosition } : entry)),
        );
      }
    }

    function handleMouseUp() {
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

  function startPan(event: ReactMouseEvent<HTMLDivElement>) {
    // Only ever reaches here for a mousedown on empty canvas background — a node's own
    // mousedown handler (see startNodeDrag) stops propagation before it would bubble up here.
    event.preventDefault();
    setPan({ id: null, startX: event.clientX, startY: event.clientY, originX: viewOffset.x, originY: viewOffset.y });
  }

  function startNodeDrag(entry: OperationEntryState) {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
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
    // disappears from the canvas while it's being edited (see the entries.map filter below).
    setConfiguringEntryId(id);
  }

  // × in the draft toolbar: for a brand-new operation (no snapshot) this deletes it. For one
  // reopened via "Editar" it discards the in-progress changes and restores the operation to
  // how it looked before editing started, instead of deleting it.
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

  // Picking a kind in the add modal (see renderConfigPanel) creates the draft entry and opens
  // the config panel for it — the entry doesn't appear on the canvas until confirmed (see the
  // entries.map below, which skips whatever id is currently being configured).
  function addOperationOfKind(kindId: string) {
    const label = labelForKind(kindId);
    const id = generateEntryId();
    setEntries((current) => {
      if (current.some((entry) => !entry.confirmed)) return current;
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(id, kindId, `${label} ${order}`, dataset, current.length)];
    });
    setConfiguringEntryId(id);
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

  function renderDraftCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    return (
      <DraftOperationCard
        name={entry.name}
        onNameChange={(name) => updateEntry(entry.id, { name })}
        canConfirm={kind.canConfirm(entry.fields)}
        onConfirm={() => {
          updateEntry(entry.id, { confirmed: true });
          // Pins its highlight so it's what shows next time the sheet panel opens (a reveal
          // click, or "Ver dados") without needing to hover first — the panel itself closes
          // right away below, since picking a column/range is done keeping it open once the
          // operation it was for is actually finished.
          setSelectedOperationId(entry.id);
          onOperationConfirmed();
        }}
        onDelete={() => removeEntry(entry.id)}
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
        isModelInput={modelInputIds.includes(entry.id)}
        isModelInputEligible={isModelInputEligible}
        onToggleModelInput={() =>
          onModelInputIdsChange(
            modelInputIds.includes(entry.id) ? modelInputIds.filter((id) => id !== entry.id) : [...modelInputIds, entry.id],
          )
        }
        isModelOutput={modelOutputIds.includes(entry.id)}
        onToggleModelOutput={() =>
          onModelOutputIdsChange(
            modelOutputIds.includes(entry.id) ? modelOutputIds.filter((id) => id !== entry.id) : [...modelOutputIds, entry.id],
          )
        }
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
    if (!configuringEntryId) {
      return (
        <AddOperationModal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          kinds={KINDS.map((kind) => ({ id: kind.id, label: labelForKind(kind.id) }))}
          onPick={addOperationOfKind}
        />
      );
    }

    const configuringEntry = entries.find((entry) => entry.id === configuringEntryId);
    if (!configuringEntry) return null;
    const isEditingExisting = configuringEntryId in editSnapshots;

    return (
      <div className="add-operation-panel" role="dialog" aria-modal="true" aria-labelledby="add-operation-panel-title">
        <div className="add-operation-panel__header">
          <h2 id="add-operation-panel-title" className="add-operation-panel__title">
            {isEditingExisting ? 'Editar operação' : 'Nova operação'}
          </h2>
          <button
            type="button"
            className="add-operation-panel__close"
            onClick={() => cancelEntry(configuringEntry.id)}
            aria-label="Cancelar"
          >
            ×
          </button>
        </div>
        <div className="add-operation-panel__body">{renderDraftCard(configuringEntry)}</div>
      </div>
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

      <div
        className={pan ? 'operation-canvas__viewport operation-canvas__viewport--panning' : 'operation-canvas__viewport'}
        onMouseDown={startPan}
        // Keeps the dotted grid (see OperationPanel.css) moving together with the surface below,
        // instead of staying fixed to the viewport while the nodes on it pan past.
        style={{ backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px` }}
      >
        <div className="operation-canvas__surface" style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px)` }}>
          <svg className="operation-canvas__edges">
            {edges.map((edge, index) => (
              <path key={`${edge.fromId}-${edge.toId}-${index}`} d={edgePath(edge)} />
            ))}
          </svg>

          {entries.map((entry) => {
            // Being built or edited in the config panel right now (see renderConfigPanel) —
            // hidden from the canvas until it's confirmed there.
            if (entry.id === configuringEntryId) return null;

            return (
              <div
                key={entry.id}
                className="operation-canvas__node"
                style={{ left: entry.position.x, top: entry.position.y, width: NODE_WIDTH }}
                onMouseDown={startNodeDrag(entry)}
              >
                {entry.confirmed ? renderConfirmedCard(entry) : renderDraftCard(entry)}
              </div>
            );
          })}
        </div>
      </div>

      {renderConfigPanel()}
    </div>
  );
}
