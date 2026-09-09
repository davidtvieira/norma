import { useEffect, useLayoutEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource } from '../../types/valueSource';
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
  onCancel: () => void;
  canConfirm: boolean;
  onConfirm: () => void;
  onDelete: () => void;
  children: ReactNode;
}

/**
 * An operation being built or edited: name + cancel (× reverts an edit back to the confirmed
 * state, or deletes a never-confirmed draft), then whatever type-specific config the kind
 * renders as `children`, then confirm/delete once ready.
 */
function DraftOperationCard({ name, onNameChange, onCancel, canConfirm, onConfirm, onDelete, children }: DraftOperationCardProps) {
  return (
    <div className="operation-entry">
      <div className="operation-entry__toolbar">
        <input
          type="text"
          className="operation-entry__name-input"
          value={name}
          placeholder="Nome da operação"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button type="button" className="operation-entry__remove" onClick={onCancel} aria-label="Cancelar">
          ×
        </button>
      </div>

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

interface InfoButtonProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Toggles the confirmed card's summary (the type-specific detail line — which table/columns/
 * range it's set up against). Collapsed by default so a confirmed card shows only its name and
 * input/output, matching the (usually longer) draft-config detail it was built from.
 */
function InfoButton({ open, onToggle }: InfoButtonProps) {
  return (
    <button
      type="button"
      className={open ? 'operation-card__info operation-card__info--active' : 'operation-card__info'}
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? 'Ocultar detalhes' : 'Ver detalhes'}
      title={open ? 'Ocultar detalhes' : 'Ver detalhes'}
    >
      i
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
  onEdit: () => void;
  editDisabled: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  summary: ReactNode;
  children: ReactNode;
  isModelInput: boolean;
  isModelInputEligible: boolean;
  onToggleModelInput: () => void;
  isModelOutput: boolean;
  onToggleModelOutput: () => void;
}

/**
 * A confirmed operation node: name + model input/output toggles + info + edit (pencil, reopens
 * it as a draft), a type-specific one-line summary (collapsed behind the info toggle), then
 * whatever type-specific input/result the kind renders as `children`. Hover drives that kind's
 * sheet highlight while the card is under the mouse.
 */
function ConfirmedOperationCard({
  name,
  onEdit,
  editDisabled,
  onMouseEnter,
  onMouseLeave,
  summary,
  children,
  isModelInput,
  isModelInputEligible,
  onToggleModelInput,
  isModelOutput,
  onToggleModelOutput,
}: ConfirmedOperationCardProps) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  return (
    <div className="operation-card" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          {isModelInputEligible && <IoToggle label="Input" active={isModelInput} onToggle={onToggleModelInput} />}
          <IoToggle label="Output" active={isModelOutput} onToggle={onToggleModelOutput} />
          <InfoButton open={isInfoOpen} onToggle={() => setIsInfoOpen((current) => !current)} />
          <EditButton onEdit={onEdit} disabled={editDisabled} />
        </div>
      </div>

      {isInfoOpen && <div className="operation-card__summary">{summary}</div>}

      {children}
    </div>
  );
}

// Overrides the API's (English) labels with their Portuguese display names — the id is still
// what's sent to/matched against the API, only the label shown in the UI is translated here.
const KIND_LABELS: Record<string, string> = { lookup: 'Pesquisa aninhada', sum: 'Somar' };

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
function createEntry(kindId: string, name: string, dataset: DatasetImportResponse, placementIndex: number): OperationEntryState {
  return {
    id: generateEntryId(),
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
  /** Reports the current entry list up so App.tsx can export it (see the "Guardar modelo" flow). */
  onEntriesChange: (entries: SerializableEntry[]) => void;
  /** The model's designated input/output operation — picked directly on a node's toggles below
   * (see ConfirmedOperationCard) instead of in the save modal. Owned by App.tsx, same as the
   * column/range pick state above, since it has to survive an operation being deleted/edited. */
  modelInputId: string | null;
  modelOutputId: string | null;
  onModelInputChange: (id: string | null) => void;
  onModelOutputChange: (id: string | null) => void;
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
 * Operation canvas. "+ Adicionar operação" opens a modal to pick a type (see useOperationTypes
 * for the kinds the API supports) instead of an inline menu — picking one creates a draft node
 * on the canvas, configured in place exactly as before. From there each kind renders its own
 * config, summary, and input/result, but the surrounding node chrome — name/cancel/edit/
 * confirm/delete, model input/output toggles, and hover behavior — is all shared.
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
  onEntriesChange,
  modelInputId,
  modelOutputId,
  onModelInputChange,
  onModelOutputChange,
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
  // The row each operation's query currently matches (if any) — only meaningful for kinds
  // that implement getCellHighlight (currently just lookup).
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Each confirmed operation's latest computed result (as a string), keyed by entry id — the
  // frontend-only stand-in for a chain: another operation's "input" field can reference an id
  // here instead of a typed value. Null means "no value yet" (loading, error, or not found).
  const [results, setResults] = useState<Record<string, string | null>>({});
  const resolvedInputs = resolveOperationInputs(entries, results);

  // The canvas' pan offset (dragging empty background) and, independently, a node being dragged
  // — see the window-level listener effect below. Both are plain pointer-delta math, no library.
  const [viewOffset, setViewOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const [pan, setPan] = useState<DragState | null>(null);
  const [dragNode, setDragNode] = useState<DragState | null>(null);

  // Lets App.tsx export the model (see the "Guardar modelo" flow) without entries living there.
  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  // Sheet column/range tints: every operation being built/edited shows what it's picked, and so
  // does a confirmed operation under the mouse if its kind has no exact-cell highlight to show
  // instead (e.g. sum, whose result isn't a single cell).
  useEffect(() => {
    const columns: ColumnHighlight[] = [];
    const ranges: RangeHighlight[] = [];
    for (const entry of entries) {
      const kind = KINDS_BY_ID[entry.kindId];
      const isDraft = !entry.confirmed;
      const isHoveredWithoutCellPrecision = entry.confirmed && entry.id === hoveredOperationId && !kind.getCellHighlight;
      if (isDraft || isHoveredWithoutCellPrecision) {
        columns.push(...kind.getColumnHighlights(entry.fields));
        ranges.push(...(kind.getRangeHighlights?.(entry.fields) ?? []));
      }
    }
    onColumnHighlightsChange(columns);
    onRangeHighlightsChange(ranges);
  }, [entries, hoveredOperationId, onColumnHighlightsChange, onRangeHighlightsChange]);

  // Exact input/output cell highlight: only for a hovered confirmed operation whose kind
  // supports that precision, and only once it actually has a match.
  useEffect(() => {
    const entry = entries.find((item) => item.id === hoveredOperationId && item.confirmed);
    const kind = entry ? KINDS_BY_ID[entry.kindId] : null;
    if (!entry || !kind?.getCellHighlight) {
      onCellHighlightChange(null);
      return;
    }
    onCellHighlightChange(kind.getCellHighlight(entry.fields, matchedRows[entry.id] ?? null));
  }, [entries, hoveredOperationId, matchedRows, onCellHighlightChange]);

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

  function addOperationOfKind(kindId: string) {
    const label = labelForKind(kindId);
    setEntries((current) => {
      if (current.some((entry) => !entry.confirmed)) return current;
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(kindId, `${label} ${order}`, dataset, current.length)];
    });
  }

  const hasDraftInProgress = entries.some((entry) => !entry.confirmed);
  const confirmedCount = entries.filter((entry) => entry.confirmed).length;

  // Every confirmed operation whose input dynamically references another one's result — drawn
  // as a connecting line between the two nodes (see edgePath) instead of nesting one inside the
  // other's DOM, since both need to stay independently draggable on the canvas.
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const edges: Edge[] = entries.flatMap((entry) => {
    if (!entry.confirmed) return [];
    const source = getInputSource(entry.fields);
    if (source.type !== 'reference') return [];
    const from = entriesById.get(source.operationId);
    if (!from) return [];
    return [{ fromId: from.id, toId: entry.id, from: from.position, to: entry.position }];
  });

  function renderDraftCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    return (
      <DraftOperationCard
        name={entry.name}
        onNameChange={(name) => updateEntry(entry.id, { name })}
        onCancel={() => cancelEntry(entry.id)}
        canConfirm={kind.canConfirm(entry.fields)}
        onConfirm={() => updateEntry(entry.id, { confirmed: true })}
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

  function renderConfirmedCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    const isModelInputEligible = Boolean(kind.renderInputEditor) && getInputSource(entry.fields).type === 'literal';

    return (
      <ConfirmedOperationCard
        name={entry.name}
        onEdit={() => editEntry(entry.id)}
        editDisabled={hasDraftInProgress}
        onMouseEnter={() => setHoveredOperationId(entry.id)}
        onMouseLeave={() => setHoveredOperationId((current) => (current === entry.id ? null : current))}
        summary={kind.renderSummary(entry.fields, dataset)}
        isModelInput={modelInputId === entry.id}
        isModelInputEligible={isModelInputEligible}
        onToggleModelInput={() => onModelInputChange(modelInputId === entry.id ? null : entry.id)}
        isModelOutput={modelOutputId === entry.id}
        onToggleModelOutput={() => onModelOutputChange(modelOutputId === entry.id ? null : entry.id)}
      >
        {kind.renderBody({
          fields: entry.fields,
          updateFields: (patch) => updateEntryFields(entry.id, patch),
          datasetId: dataset.datasetId,
          onMatchChange: (rowIndex) => setMatchedRows((current) => ({ ...current, [entry.id]: rowIndex })),
          resolvedInput: resolvedInputs[entry.id],
          referenceOptions: referenceOptionsFor(entry.id),
          onResultChange: (value) => setResults((current) => ({ ...current, [entry.id]: value })),
        })}
      </ConfirmedOperationCard>
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
            {edges.map((edge) => (
              <path key={`${edge.fromId}-${edge.toId}`} d={edgePath(edge)} />
            ))}
          </svg>

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="operation-canvas__node"
              style={{ left: entry.position.x, top: entry.position.y, width: NODE_WIDTH }}
              onMouseDown={startNodeDrag(entry)}
            >
              {entry.confirmed ? renderConfirmedCard(entry) : renderDraftCard(entry)}
            </div>
          ))}
        </div>
      </div>

      <AddOperationModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        kinds={KINDS.map((kind) => ({ id: kind.id, label: labelForKind(kind.id) }))}
        onPick={addOperationOfKind}
      />
    </div>
  );
}
