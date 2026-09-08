import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState } from '../../types/columnPick';
import type { ColumnHighlight, ConditionHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import type { ConditionFields, ConditionKind } from './conditionKind';
import { lookupKind } from './kinds/lookupKind';
import { sumKind } from './kinds/sumKind';
import './ConditionPanel.css';

/**
 * Shared building blocks for the condition list: the add-condition button and outer shell,
 * the draft/edit card chrome (name + cancel, a type-specific config area, confirm/delete),
 * and the confirmed-card chrome (name + edit, hover, a type-specific summary/input/result
 * area). The orchestrator component at the bottom of this file (`ConditionPanel`) is what
 * App.tsx actually renders — it owns the single entry list and delegates anything
 * type-specific to whichever "kind" (see conditionKind.ts) an entry was created as.
 */

interface ConditionPanelShellProps {
  addButtonLabel: string;
  onAdd: () => void;
  children: ReactNode;
}

function ConditionPanelShell({ addButtonLabel, onAdd, children }: ConditionPanelShellProps) {
  return (
    <div className="condition-panel">
      <button type="button" className="condition-panel__add-button" onClick={onAdd}>
        {addButtonLabel}
      </button>
      {children}
    </div>
  );
}

interface ConditionListProps {
  title: string;
  children: ReactNode;
}

function ConditionList({ title, children }: ConditionListProps) {
  return (
    <div className="condition-panel__list">
      <h2 className="condition-panel__title">{title}</h2>
      {children}
    </div>
  );
}

interface DraftConditionCardProps {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  canConfirm: boolean;
  onConfirm: () => void;
  onDelete: () => void;
  children: ReactNode;
}

/**
 * A condition being built or edited: name + cancel (× reverts an edit back to the confirmed
 * state, or deletes a never-confirmed draft), then whatever type-specific config the kind
 * renders as `children`, then confirm/delete once ready.
 */
function DraftConditionCard({ name, onNameChange, onCancel, canConfirm, onConfirm, onDelete, children }: DraftConditionCardProps) {
  return (
    <div className="condition-entry">
      <div className="condition-entry__toolbar">
        <input
          type="text"
          className="condition-entry__name-input"
          value={name}
          placeholder="Nome da condição"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button type="button" className="condition-entry__remove" onClick={onCancel} aria-label="Cancelar">
          ×
        </button>
      </div>

      {children}

      {canConfirm && (
        <div className="condition-entry__confirm-row">
          <button type="button" className="condition-entry__confirm-button" onClick={onConfirm}>
            Concluir condição
          </button>
          <button type="button" className="condition-entry__delete-button" onClick={onDelete}>
            Remover condição
          </button>
        </div>
      )}
    </div>
  );
}

interface ConfirmedConditionCardProps {
  name: string;
  onEdit: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  summary: ReactNode;
  children: ReactNode;
}

/**
 * A confirmed condition in the results list: name + edit (pencil, reopens it as a draft),
 * a type-specific one-line summary, then whatever type-specific input/result the kind renders
 * as `children`. Hover drives that kind's sheet highlight while the card is under the mouse.
 */
function ConfirmedConditionCard({ name, onEdit, onMouseEnter, onMouseLeave, summary, children }: ConfirmedConditionCardProps) {
  return (
    <div className="condition-card" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="condition-card__header">
        <h3 className="condition-card__name">{name || 'Condição sem nome'}</h3>
        <div className="condition-card__actions">
          <button type="button" className="condition-card__edit" onClick={onEdit} aria-label="Editar condição">
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
        </div>
      </div>

      <div className="condition-card__summary">{summary}</div>

      {children}
    </div>
  );
}

const KINDS: ConditionKind[] = [lookupKind, sumKind];
const KINDS_BY_ID: Record<string, ConditionKind> = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));
const FALLBACK_LABELS: Record<string, string> = { lookup: 'Lookup', sum: 'Sum' };

interface ConditionEntryState {
  id: string;
  name: string;
  kindId: string;
  confirmed: boolean;
  searching: boolean;
  fields: ConditionFields;
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
function createEntry(kindId: string, name: string): ConditionEntryState {
  return {
    id: generateEntryId(),
    name,
    kindId,
    confirmed: false,
    searching: false,
    fields: KINDS_BY_ID[kindId].createFields(),
  };
}

interface ConditionPanelProps {
  dataset: DatasetImportResponse;
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  onCellHighlightChange: (highlight: ConditionHighlight | null) => void;
}

/**
 * Left-panel condition builder. "+ Adicionar condição" opens a menu of the operation types the
 * API supports (see useOperationTypes) instead of assuming one — picking a type creates a
 * draft of that kind. From there each kind renders its own config, summary, and input/result,
 * but the surrounding card, name/cancel/edit/confirm/delete, and hover behavior are all shared.
 */
export function ConditionPanel({
  dataset,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  onColumnHighlightsChange,
  onCellHighlightChange,
}: ConditionPanelProps) {
  const [entries, setEntries] = useState<ConditionEntryState[]>([]);
  const operationTypes = useOperationTypes();
  // Snapshot of a condition's confirmed state, taken when it enters edit mode — lets the ×
  // cancel the edit (restore the snapshot) instead of deleting an already-confirmed condition.
  const [editSnapshots, setEditSnapshots] = useState<Record<string, ConditionEntryState>>({});
  // The confirmed condition card currently under the mouse, if any.
  const [hoveredConditionId, setHoveredConditionId] = useState<string | null>(null);
  // The row each condition's query currently matches (if any) — only meaningful for kinds
  // that implement getCellHighlight (currently just lookup).
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});
  const [isPickingKind, setIsPickingKind] = useState(false);

  // Sheet column tints: every condition being built/edited shows its picked columns, and so
  // does a confirmed condition under the mouse if its kind has no exact-cell highlight to show
  // instead (e.g. sum, whose result isn't a single cell).
  useEffect(() => {
    const highlights: ColumnHighlight[] = [];
    for (const entry of entries) {
      const kind = KINDS_BY_ID[entry.kindId];
      const isDraft = !entry.confirmed;
      const isHoveredWithoutCellPrecision = entry.confirmed && entry.id === hoveredConditionId && !kind.getCellHighlight;
      if (isDraft || isHoveredWithoutCellPrecision) {
        highlights.push(...kind.getColumnHighlights(entry.fields));
      }
    }
    onColumnHighlightsChange(highlights);
  }, [entries, hoveredConditionId, onColumnHighlightsChange]);

  // Exact input/output cell highlight: only for a hovered confirmed condition whose kind
  // supports that precision, and only once it actually has a match.
  useEffect(() => {
    const entry = entries.find((item) => item.id === hoveredConditionId && item.confirmed);
    const kind = entry ? KINDS_BY_ID[entry.kindId] : null;
    if (!entry || !kind?.getCellHighlight) {
      onCellHighlightChange(null);
      return;
    }
    onCellHighlightChange(kind.getCellHighlight(entry.fields, matchedRows[entry.id] ?? null));
  }, [entries, hoveredConditionId, matchedRows, onCellHighlightChange]);

  function updateEntry(id: string, patch: Partial<ConditionEntryState>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function updateEntryFields(id: string, patch: ConditionFields) {
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
  }

  function editEntry(id: string) {
    const entry = entries.find((item) => item.id === id);
    if (entry) {
      setEditSnapshots((current) => ({ ...current, [id]: entry }));
    }
    updateEntry(id, { confirmed: false, searching: true });
  }

  // × in the draft toolbar: for a brand-new condition (no snapshot) this deletes it. For one
  // reopened via "Editar" it discards the in-progress changes and restores the condition to
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

  function addConditionOfKind(kindId: string) {
    const label = labelForKind(kindId);
    setEntries((current) => {
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(kindId, `${label} ${order}`)];
    });
    setIsPickingKind(false);
  }

  const draftEntries = entries.filter((entry) => !entry.confirmed);
  const readyConditions = entries.filter((entry) => entry.confirmed);

  return (
    <ConditionPanelShell addButtonLabel="+ Adicionar condição" onAdd={() => setIsPickingKind((current) => !current)}>
      {isPickingKind && (
        <div className="condition-panel__kind-menu">
          {KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className="condition-panel__kind-option"
              onClick={() => addConditionOfKind(kind.id)}
            >
              {labelForKind(kind.id)}
            </button>
          ))}
        </div>
      )}

      {draftEntries.map((entry) => {
        const kind = KINDS_BY_ID[entry.kindId];
        return (
          <DraftConditionCard
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
              searching: entry.searching,
              startSearching: () => updateEntry(entry.id, { searching: true }),
              columnPick,
              onStartColumnPick,
              onFinishColumnPick,
            })}
          </DraftConditionCard>
        );
      })}

      {readyConditions.length > 0 && (
        <ConditionList title="Condições">
          {readyConditions.map((entry) => {
            const kind = KINDS_BY_ID[entry.kindId];
            return (
              <ConfirmedConditionCard
                key={entry.id}
                name={entry.name}
                onEdit={() => editEntry(entry.id)}
                onMouseEnter={() => setHoveredConditionId(entry.id)}
                onMouseLeave={() => setHoveredConditionId((current) => (current === entry.id ? null : current))}
                summary={kind.renderSummary(entry.fields, dataset)}
              >
                {kind.renderBody({
                  fields: entry.fields,
                  updateFields: (patch) => updateEntryFields(entry.id, patch),
                  datasetId: dataset.datasetId,
                  onMatchChange: (rowIndex) => setMatchedRows((current) => ({ ...current, [entry.id]: rowIndex })),
                })}
              </ConfirmedConditionCard>
            );
          })}
        </ConditionList>
      )}
    </ConditionPanelShell>
  );
}
