import { useEffect, useState } from 'react';
import type { CellValue, DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState } from '../../types/columnPick';
import type { ColumnHighlight, ConditionHighlight } from '../../types/highlight';
import type { OperationType } from '../../types/operation';
import { listOperationTypes, lookupValue } from '../../services/datasetApi';
import { formatCellValue } from '../../utils/sheet';
import './LookupPanel.css';

const FALLBACK_OPERATION_LABEL = 'Condição';

interface LookupPanelProps {
  dataset: DatasetImportResponse;
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  // Whole-column tints for whichever conditions are being built/edited right now.
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  // The exact input/output cell of the condition currently hovered in the "Condições" list.
  onCellHighlightChange: (highlight: ConditionHighlight | null) => void;
}

interface LookupEntryState {
  id: string;
  name: string;
  query: string;
  searching: boolean;
  searchSheetIndex: number | '';
  resultSheetIndex: number | '';
  searchColumn: number | '';
  resultColumn: number | '';
  confirmed: boolean;
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
 * development to catch impure ones, so this must not rely on shared mutable state (like an
 * incrementing module-level counter) — `order` comes from the caller's current entries count.
 */
function createEntry(operationLabel: string, order: number): LookupEntryState {
  return {
    id: generateEntryId(),
    name: `${operationLabel} ${order}`,
    query: '',
    searching: false,
    searchSheetIndex: '',
    resultSheetIndex: '',
    searchColumn: '',
    resultColumn: '',
    confirmed: false,
  };
}

/**
 * Left-panel condition builder: define a condition first — search table/column and result
 * table/column, picked by dragging a table onto a drop zone and clicking a column in the
 * sheet viewer (each column applies as soon as it's clicked) — with no value yet. Clicking
 * "Concluir condição" drops it to the "Condições" list at the bottom, where it's reused:
 * type a value there to run it.
 */
export function LookupPanel({
  dataset,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  onColumnHighlightsChange,
  onCellHighlightChange,
}: LookupPanelProps) {
  const [entries, setEntries] = useState<LookupEntryState[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  // Snapshot of a condition's confirmed state, taken when it enters edit mode — lets the ×
  // cancel the edit (restore the snapshot) instead of deleting an already-confirmed condition.
  const [editSnapshots, setEditSnapshots] = useState<Record<string, LookupEntryState>>({});
  // The confirmed condition card currently under the mouse, if any — drives the exact
  // input/output cell highlight (only one card can be hovered at a time).
  const [hoveredConditionId, setHoveredConditionId] = useState<string | null>(null);
  // The row each condition's query currently matches (if any), reported by its LookupResult —
  // combined with hoveredConditionId below to pick out the exact input/output cells.
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;

    listOperationTypes()
      .then((types) => {
        if (!cancelled) {
          setOperationTypes(types);
        }
      })
      .catch(() => {
        // Falls back to a generic condition name below — not worth surfacing an error for.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Draft/edit-mode column highlight: automatic, no interaction needed — every condition
  // currently being built or edited shows its picked search/result columns in the sheet.
  useEffect(() => {
    const highlights: ColumnHighlight[] = [];
    for (const entry of entries) {
      if (entry.confirmed) continue;
      if (entry.searchSheetIndex !== '' && entry.searchColumn !== '') {
        highlights.push({ sheetIndex: entry.searchSheetIndex, column: entry.searchColumn, role: 'search' });
      }
      if (entry.resultSheetIndex !== '' && entry.resultColumn !== '') {
        highlights.push({ sheetIndex: entry.resultSheetIndex, column: entry.resultColumn, role: 'result' });
      }
    }
    onColumnHighlightsChange(highlights);
  }, [entries, onColumnHighlightsChange]);

  // Confirmed-card hover: exact input/output cell highlight, only while there's an actual
  // match — hovering a condition with no (or not-yet-found) query result highlights nothing.
  useEffect(() => {
    const entry = entries.find((item) => item.id === hoveredConditionId && item.confirmed);
    const rowIndex = entry ? matchedRows[entry.id] ?? null : null;
    onCellHighlightChange(
      entry && rowIndex !== null
        ? {
            searchSheetIndex: entry.searchSheetIndex as number,
            searchColumn: entry.searchColumn as number,
            resultSheetIndex: entry.resultSheetIndex as number,
            resultColumn: entry.resultColumn as number,
            rowIndex,
          }
        : null,
    );
  }, [entries, hoveredConditionId, matchedRows, onCellHighlightChange]);

  const defaultOperationLabel = operationTypes[0]?.label ?? FALLBACK_OPERATION_LABEL;

  function updateEntry(id: string, patch: Partial<LookupEntryState>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
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

  // × in the draft toolbar: for a brand-new condition (no snapshot) this deletes it, same as
  // before. For one reopened via "Editar" it discards the in-progress changes and restores the
  // condition to how it looked before editing started, instead of deleting it.
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

  function startSearching(entry: LookupEntryState) {
    if (dataset.sheets.length === 1) {
      updateEntry(entry.id, { searching: true, searchSheetIndex: 0, resultSheetIndex: 0 });
    } else {
      updateEntry(entry.id, { searching: true });
    }
  }

  const draftEntries = entries.filter((entry) => !entry.confirmed);
  const readyConditions = entries.filter((entry) => entry.confirmed);

  return (
    <div className="lookup-panel">
      <button
        type="button"
        className="lookup-panel__add-button"
        onClick={() =>
          setEntries((current) => [...current, createEntry(defaultOperationLabel, current.length + 1)])
        }
      >
        + Adicionar condição
      </button>

      {draftEntries.map((entry) => (
        <div key={entry.id} className="lookup-entry">
          <div className="lookup-entry__toolbar">
            <input
              type="text"
              className="lookup-entry__name-input"
              value={entry.name}
              placeholder="Nome da condição"
              onChange={(event) => updateEntry(entry.id, { name: event.target.value })}
            />
            <button
              type="button"
              className="lookup-entry__remove"
              onClick={() => cancelEntry(entry.id)}
              aria-label="Cancelar"
            >
              ×
            </button>
          </div>

          {!entry.searching && (
            <button type="button" className="lookup-entry__search-button" onClick={() => startSearching(entry)}>
              Procurar valor
            </button>
          )}

          {entry.searching && (
            <div className="lookup-entry__columns">
              <TableSelect
                label="Tabela onde procurar"
                dataset={dataset}
                sheetIndex={entry.searchSheetIndex}
                onSelect={(sheetIndex) => updateEntry(entry.id, { searchSheetIndex: sheetIndex, searchColumn: '' })}
              />
              <TableSelect
                label="Tabela a devolver"
                dataset={dataset}
                sheetIndex={entry.resultSheetIndex}
                onSelect={(sheetIndex) => updateEntry(entry.id, { resultSheetIndex: sheetIndex, resultColumn: '' })}
              />
            </div>
          )}

          {entry.searchSheetIndex !== '' && entry.resultSheetIndex !== '' && (
            <div className="lookup-entry__columns">
              <ColumnPickerField
                label="Coluna onde procurar"
                value={entry.searchColumn}
                isPicking={columnPick?.entryId === entry.id && columnPick.field === 'search'}
                pendingColumn={columnPick?.entryId === entry.id && columnPick.field === 'search' ? columnPick.column : null}
                onStart={() => onStartColumnPick(entry.id, 'search', entry.searchSheetIndex as number)}
                onConfirm={(column) => {
                  updateEntry(entry.id, { searchColumn: column });
                  onFinishColumnPick();
                }}
                onCancel={onFinishColumnPick}
                onClear={() => updateEntry(entry.id, { searchColumn: '' })}
              />
              <ColumnPickerField
                label="Coluna a devolver"
                value={entry.resultColumn}
                isPicking={columnPick?.entryId === entry.id && columnPick.field === 'result'}
                pendingColumn={columnPick?.entryId === entry.id && columnPick.field === 'result' ? columnPick.column : null}
                onStart={() => onStartColumnPick(entry.id, 'result', entry.resultSheetIndex as number)}
                onConfirm={(column) => {
                  updateEntry(entry.id, { resultColumn: column });
                  onFinishColumnPick();
                }}
                onCancel={onFinishColumnPick}
                onClear={() => updateEntry(entry.id, { resultColumn: '' })}
              />
            </div>
          )}

          {entry.searchColumn !== '' && entry.resultColumn !== '' && (
            <div className="lookup-entry__confirm-row">
              <button
                type="button"
                className="lookup-entry__confirm-button"
                onClick={() => updateEntry(entry.id, { confirmed: true })}
              >
                Concluir condição
              </button>
              <button
                type="button"
                className="lookup-entry__delete-button"
                onClick={() => removeEntry(entry.id)}
              >
                Remover condição
              </button>
            </div>
          )}
        </div>
      ))}

      {readyConditions.length > 0 && (
        <div className="lookup-panel__conditions">
          <h2 className="lookup-panel__conditions-title">Condições</h2>

          {readyConditions.map((entry) => {
            const searchSheetIndex = entry.searchSheetIndex as number;
            const resultSheetIndex = entry.resultSheetIndex as number;
            const searchColumn = entry.searchColumn as number;
            const resultColumn = entry.resultColumn as number;

            return (
              <div
                key={entry.id}
                className="lookup-condition"
                onMouseEnter={() => setHoveredConditionId(entry.id)}
                onMouseLeave={() => setHoveredConditionId((current) => (current === entry.id ? null : current))}
              >
                <div className="lookup-condition__header">
                  <h3 className="lookup-condition__name">{entry.name || 'Condição sem nome'}</h3>
                  <div className="lookup-condition__actions">
                    <button
                      type="button"
                      className="lookup-condition__edit"
                      onClick={() => editEntry(entry.id)}
                      aria-label="Editar condição"
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
                  </div>
                </div>

                <div className="lookup-condition__summary">
                  <span>
                    {dataset.sheets[searchSheetIndex].sheetName} · Coluna {searchColumn}
                  </span>
                  <span className="lookup-condition__arrow">→</span>
                  <span>
                    {dataset.sheets[resultSheetIndex].sheetName} · Coluna {resultColumn}
                  </span>
                </div>

                <input
                  type="text"
                  className="lookup-entry__input"
                  placeholder="Introduza um valor"
                  value={entry.query}
                  onChange={(event) => updateEntry(entry.id, { query: event.target.value })}
                />

                {entry.query.trim() !== '' && (
                  <LookupResult
                    datasetId={dataset.datasetId}
                    query={entry.query}
                    searchSheetIndex={searchSheetIndex}
                    resultSheetIndex={resultSheetIndex}
                    searchColumn={searchColumn}
                    resultColumn={resultColumn}
                    onMatchChange={(rowIndex) =>
                      setMatchedRows((current) => ({ ...current, [entry.id]: rowIndex }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TableSelectProps {
  label: string;
  dataset: DatasetImportResponse;
  sheetIndex: number | '';
  onSelect: (sheetIndex: number) => void;
}

function TableSelect({ label, dataset, sheetIndex, onSelect }: TableSelectProps) {
  return (
    <div className="lookup-entry__field">
      <label className="lookup-entry__label">{label}</label>
      <select
        className="lookup-entry__select"
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

function ColumnPickerField({ label, value, isPicking, pendingColumn, onStart, onConfirm, onCancel, onClear }: ColumnPickerFieldProps) {
  // Clicking a column header in the sheet viewer commits it immediately — no separate
  // confirm step.
  useEffect(() => {
    if (isPicking && pendingColumn !== null) {
      onConfirm(pendingColumn);
    }
  }, [isPicking, pendingColumn, onConfirm]);

  return (
    <div className="lookup-entry__field">
      <label className="lookup-entry__label">{label}</label>

      {!isPicking && value === '' && (
        <button type="button" className="lookup-entry__pick-button" onClick={onStart}>
          Selecionar coluna
        </button>
      )}

      {!isPicking && value !== '' && (
        <div className="lookup-column-pill">
          <span className="lookup-column-pill__value">Coluna {value}</span>
          <button type="button" className="lookup-column-pill__clear" onClick={onClear} aria-label="Alterar coluna">
            ×
          </button>
        </div>
      )}

      {isPicking && (
        <div className="lookup-column-picking">
          <span className="lookup-column-picking__hint">Escolha uma coluna na tabela à direita</span>
          <button type="button" className="lookup-column-picking__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

interface LookupResultProps {
  datasetId: string;
  query: string;
  searchSheetIndex: number;
  resultSheetIndex: number;
  searchColumn: number;
  resultColumn: number;
  onMatchChange: (rowIndex: number | null) => void;
}

type LookupRequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; found: boolean; value: CellValue | null };

const LOOKUP_DEBOUNCE_MS = 2000;

/**
 * Runs the condition entirely on the API: the dataset id (the API keeps the parsed
 * dataset in memory from the import call) plus the search/result table and column
 * indexes are sent to /api/v1/dataset/operation/lookup, which does the row matching and
 * returns the value — this component only renders the outcome. The request is debounced by
 * LOOKUP_DEBOUNCE_MS so it doesn't fire on every keystroke while the query is being typed.
 */
function LookupResult({
  datasetId,
  query,
  searchSheetIndex,
  resultSheetIndex,
  searchColumn,
  resultColumn,
  onMatchChange,
}: LookupResultProps) {
  const [state, setState] = useState<LookupRequestState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const timeoutId = window.setTimeout(() => {
      lookupValue({ datasetId, query, searchSheetIndex, searchColumn, resultSheetIndex, resultColumn })
        .then((response) => {
          if (!cancelled) {
            setState({ status: 'done', found: response.found, value: response.value });
            onMatchChange(response.found ? response.rowIndex : null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao procurar o valor.' });
          }
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      onMatchChange(null);
    };
    // onMatchChange is a fresh closure from the parent every render but only ever closes over
    // a stable id and a stable setState — safe to omit so it doesn't reset the debounce timer
    // on every unrelated keystroke elsewhere in the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, query, searchSheetIndex, searchColumn, resultSheetIndex, resultColumn]);

  if (state.status === 'loading') {
    return <p className="lookup-entry__result lookup-entry__result--empty">A procurar…</p>;
  }

  if (state.status === 'error') {
    return <p className="lookup-entry__result lookup-entry__result--empty">{state.message}</p>;
  }

  if (!state.found) {
    return <p className="lookup-entry__result lookup-entry__result--empty">Sem correspondência encontrada.</p>;
  }

  const resultValue = formatCellValue(state.value ?? undefined);

  return (
    <p className="lookup-entry__result">
      <span className="lookup-entry__result-label">Resultado:</span> {resultValue || '(vazio)'}
    </p>
  );
}
