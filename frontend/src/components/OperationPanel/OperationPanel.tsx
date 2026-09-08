import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource } from '../../types/valueSource';
import type { OperationFields, OperationKind, ReferenceOption } from './operationKind';
import { lookupKind } from './kinds/lookupKind';
import { sumKind } from './kinds/sumKind';
import './OperationPanel.css';

/**
 * Shared building blocks for the operation list: the add-operation button and outer shell,
 * the draft/edit card chrome (name + cancel, a type-specific config area, confirm/delete),
 * and the confirmed-card chrome (name + edit, hover, a type-specific summary/input/result
 * area). The orchestrator component at the bottom of this file (`OperationPanel`) is what
 * App.tsx actually renders — it owns the single entry list and delegates anything
 * type-specific to whichever "kind" (see operationKind.ts) an entry was created as.
 */

interface OperationPanelShellProps {
  addButtonLabel: string;
  addDisabled: boolean;
  onAdd: () => void;
  children: ReactNode;
}

function OperationPanelShell({ addButtonLabel, addDisabled, onAdd, children }: OperationPanelShellProps) {
  return (
    <div className="operation-panel">
      <button
        type="button"
        className="operation-panel__add-button"
        onClick={onAdd}
        disabled={addDisabled}
        title={addDisabled ? 'Termine a operação em curso antes de criar outra.' : undefined}
      >
        {addButtonLabel}
      </button>
      {children}
    </div>
  );
}

interface OperationListProps {
  title: string;
  count: number;
  children: ReactNode;
}

function OperationList({ title, count, children }: OperationListProps) {
  return (
    <div className="operation-panel__list">
      <h2 className="operation-panel__title">
        {title} <span className="operation-panel__count">{count}</span>
      </h2>
      {children}
    </div>
  );
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

interface ConfirmedOperationCardProps {
  name: string;
  onEdit: () => void;
  editDisabled: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  summary: ReactNode;
  children: ReactNode;
}

/**
 * A confirmed operation in the results list: name + edit (pencil, reopens it as a draft),
 * a type-specific one-line summary, then whatever type-specific input/result the kind renders
 * as `children`. Hover drives that kind's sheet highlight while the card is under the mouse.
 */
function ConfirmedOperationCard({ name, onEdit, editDisabled, onMouseEnter, onMouseLeave, summary, children }: ConfirmedOperationCardProps) {
  return (
    <div className="operation-card" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          <EditButton onEdit={onEdit} disabled={editDisabled} />
        </div>
      </div>

      <div className="operation-card__summary">{summary}</div>

      {children}
    </div>
  );
}

/**
 * An operation whose input is a dynamic reference to another confirmed operation: rendered
 * nested inside that source operation's card (see childOperationsOf/renderConfirmedEntry)
 * instead of as its own separate card in the list, since the two only make sense together.
 */
function LinkedOperationCard({ name, onEdit, editDisabled, onMouseEnter, onMouseLeave, summary, children }: ConfirmedOperationCardProps) {
  return (
    <div className="operation-card__linked-item" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="operation-card__header">
        <span className="operation-card__linked-arrow" aria-hidden="true">
          ↳
        </span>
        <h4 className="operation-card__name">{name || 'Operação sem nome'}</h4>
        <div className="operation-card__actions">
          <EditButton onEdit={onEdit} disabled={editDisabled} />
        </div>
      </div>

      <div className="operation-card__summary">{summary}</div>

      {children}
    </div>
  );
}

const KINDS: OperationKind[] = [lookupKind, sumKind];
const KINDS_BY_ID: Record<string, OperationKind> = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));
const FALLBACK_LABELS: Record<string, string> = { lookup: 'Lookup', sum: 'Sum' };

interface OperationEntryState {
  id: string;
  name: string;
  kindId: string;
  confirmed: boolean;
  fields: OperationFields;
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
function createEntry(kindId: string, name: string, dataset: DatasetImportResponse): OperationEntryState {
  return {
    id: generateEntryId(),
    name,
    kindId,
    confirmed: false,
    fields: KINDS_BY_ID[kindId].createFields(dataset),
  };
}

interface OperationPanelProps {
  dataset: DatasetImportResponse;
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  rangePick: RangePickState | null;
  onStartRangePick: (entryId: string, sheetIndex: number) => void;
  onFinishRangePick: () => void;
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  onRangeHighlightsChange: (highlights: RangeHighlight[]) => void;
  onCellHighlightChange: (highlight: OperationHighlight | null) => void;
}

/**
 * Left-panel operation builder. "+ Adicionar operação" opens a menu of the operation types the
 * API supports (see useOperationTypes) instead of assuming one — picking a type creates a
 * draft of that kind. From there each kind renders its own config, summary, and input/result,
 * but the surrounding card, name/cancel/edit/confirm/delete, and hover behavior are all shared.
 */
export function OperationPanel({
  dataset,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  rangePick,
  onStartRangePick,
  onFinishRangePick,
  onColumnHighlightsChange,
  onRangeHighlightsChange,
  onCellHighlightChange,
}: OperationPanelProps) {
  const [entries, setEntries] = useState<OperationEntryState[]>([]);
  const operationTypes = useOperationTypes();
  // Snapshot of an operation's confirmed state, taken when it enters edit mode — lets the ×
  // cancel the edit (restore the snapshot) instead of deleting an already-confirmed operation.
  const [editSnapshots, setEditSnapshots] = useState<Record<string, OperationEntryState>>({});
  // The confirmed operation card currently under the mouse, if any.
  const [hoveredOperationId, setHoveredOperationId] = useState<string | null>(null);
  // The row each operation's query currently matches (if any) — only meaningful for kinds
  // that implement getCellHighlight (currently just lookup).
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});
  const [isPickingKind, setIsPickingKind] = useState(false);
  // Each confirmed operation's latest computed result (as a string), keyed by entry id — the
  // frontend-only stand-in for a chain: another operation's "input" field can reference an id
  // here instead of a typed value. Null means "no value yet" (loading, error, or not found).
  const [results, setResults] = useState<Record<string, string | null>>({});
  const resolvedInputs = resolveOperationInputs(entries, results);

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
    return operationTypes.find((type) => type.id === kindId)?.label ?? FALLBACK_LABELS[kindId] ?? kindId;
  }

  function addOperationOfKind(kindId: string) {
    const label = labelForKind(kindId);
    setEntries((current) => {
      if (current.some((entry) => !entry.confirmed)) return current;
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(kindId, `${label} ${order}`, dataset)];
    });
    setIsPickingKind(false);
  }

  // A brand-new operation (never confirmed, no snapshot to restore) builds up near the add
  // button. One reopened via "Editar" edits in place instead — it keeps its spot in the
  // Operações list below, alongside the still-confirmed ones, rather than jumping to the top.
  const newDraftEntries = entries.filter((entry) => !entry.confirmed && !(entry.id in editSnapshots));
  const listEntries = entries.filter((entry) => entry.confirmed || entry.id in editSnapshots);
  const hasDraftInProgress = entries.some((entry) => !entry.confirmed);

  function renderDraftCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    return (
      <DraftOperationCard
        key={entry.id}
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

  // Confirmed operations whose dynamic input references entryId's result — these are rendered
  // nested inside entryId's own card (see renderConfirmedEntry) instead of as separate cards,
  // since a dynamic input only makes sense alongside the operation it's linked to.
  function childOperationsOf(entryId: string): OperationEntryState[] {
    return entries.filter((entry) => {
      if (!entry.confirmed) return false;
      const source = getInputSource(entry.fields);
      return source.type === 'reference' && source.operationId === entryId;
    });
  }

  function isLinkedChild(entry: OperationEntryState): boolean {
    const source = getInputSource(entry.fields);
    return source.type === 'reference' && entries.some((candidate) => candidate.confirmed && candidate.id === source.operationId);
  }

  function renderConfirmedEntry(entry: OperationEntryState, nested = false): ReactNode {
    const kind = KINDS_BY_ID[entry.kindId];
    const CardComponent = nested ? LinkedOperationCard : ConfirmedOperationCard;
    const children = childOperationsOf(entry.id);

    return (
      <CardComponent
        key={entry.id}
        name={entry.name}
        onEdit={() => editEntry(entry.id)}
        editDisabled={hasDraftInProgress}
        onMouseEnter={() => setHoveredOperationId(entry.id)}
        onMouseLeave={() => setHoveredOperationId((current) => (current === entry.id ? null : current))}
        summary={kind.renderSummary(entry.fields, dataset)}
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

        {children.length > 0 && (
          <div className="operation-card__linked">{children.map((child) => renderConfirmedEntry(child, true))}</div>
        )}
      </CardComponent>
    );
  }

  return (
    <OperationPanelShell
      addButtonLabel="+ Adicionar operação"
      addDisabled={hasDraftInProgress}
      onAdd={() => setIsPickingKind((current) => !current)}
    >
      {isPickingKind && !hasDraftInProgress && (
        <div className="operation-panel__kind-menu">
          {KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className="operation-panel__kind-option"
              onClick={() => addOperationOfKind(kind.id)}
            >
              {labelForKind(kind.id)}
            </button>
          ))}
        </div>
      )}

      {newDraftEntries.map(renderDraftCard)}

      {listEntries.length > 0 && (
        <OperationList title="Operações" count={listEntries.length}>
          {listEntries.map((entry) => {
            if (!entry.confirmed) {
              return renderDraftCard(entry);
            }

            // Rendered nested inside its source operation's card instead (see
            // renderConfirmedEntry) — a dynamic input only makes sense alongside what it's
            // linked to, so the two are shown together rather than as separate cards.
            if (isLinkedChild(entry)) {
              return null;
            }

            return renderConfirmedEntry(entry);
          })}
        </OperationList>
      )}
    </OperationPanelShell>
  );
}
