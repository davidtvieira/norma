import { useState } from 'react';
import type { SheetData } from '../../types/dataset';
import { findCellValue, formatCellValue, getColumnCount } from '../../utils/sheet';
import './LookupPanel.css';

interface LookupPanelProps {
  sheet: SheetData;
}

type LookupAction = 'lookup';

interface LookupEntryState {
  id: string;
  query: string;
  action: LookupAction | '';
  searchColumn: number | '';
  resultColumn: number | '';
}

let nextEntryId = 0;

function createEntry(): LookupEntryState {
  nextEntryId += 1;
  return { id: `entry-${nextEntryId}`, query: '', action: '', searchColumn: '', resultColumn: '' };
}

/**
 * Left-panel input builder: add a value, pick what to do with it (lookup, for now),
 * and — for lookup — pick which column to match against and which column to return.
 */
export function LookupPanel({ sheet }: LookupPanelProps) {
  const [entries, setEntries] = useState<LookupEntryState[]>([]);
  const columnCount = getColumnCount(sheet);
  const columnIndexes = Array.from({ length: columnCount }, (_, index) => index);

  function updateEntry(id: string, patch: Partial<LookupEntryState>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  return (
    <div className="lookup-panel">
      <button type="button" className="lookup-panel__add-button" onClick={() => setEntries((current) => [...current, createEntry()])}>
        + Adicionar valor
      </button>

      {entries.map((entry) => (
        <div key={entry.id} className="lookup-entry">
          <input
            type="text"
            className="lookup-entry__input"
            placeholder="Introduza um valor"
            value={entry.query}
            onChange={(event) => updateEntry(entry.id, { query: event.target.value })}
          />

          {entry.query.trim() !== '' && (
            <div className="lookup-entry__field">
              <label className="lookup-entry__label" htmlFor={`${entry.id}-action`}>
                O que fazer com este valor?
              </label>
              <select
                id={`${entry.id}-action`}
                className="lookup-entry__select"
                value={entry.action}
                onChange={(event) => updateEntry(entry.id, { action: event.target.value as LookupAction | '' })}
              >
                <option value="">Escolher acção</option>
                <option value="lookup">Procurar valor correspondente</option>
              </select>
            </div>
          )}

          {entry.action === 'lookup' && (
            <div className="lookup-entry__columns">
              <div className="lookup-entry__field">
                <label className="lookup-entry__label" htmlFor={`${entry.id}-search-col`}>
                  Coluna onde procurar
                </label>
                <select
                  id={`${entry.id}-search-col`}
                  className="lookup-entry__select"
                  value={entry.searchColumn}
                  onChange={(event) =>
                    updateEntry(entry.id, { searchColumn: event.target.value === '' ? '' : Number(event.target.value) })
                  }
                >
                  <option value="">Escolher coluna</option>
                  {columnIndexes.map((columnIndex) => (
                    <option key={columnIndex} value={columnIndex}>
                      Coluna {columnIndex}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lookup-entry__field">
                <label className="lookup-entry__label" htmlFor={`${entry.id}-result-col`}>
                  Coluna a devolver
                </label>
                <select
                  id={`${entry.id}-result-col`}
                  className="lookup-entry__select"
                  value={entry.resultColumn}
                  onChange={(event) =>
                    updateEntry(entry.id, { resultColumn: event.target.value === '' ? '' : Number(event.target.value) })
                  }
                >
                  <option value="">Escolher coluna</option>
                  {columnIndexes.map((columnIndex) => (
                    <option key={columnIndex} value={columnIndex}>
                      Coluna {columnIndex}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {entry.action === 'lookup' && entry.searchColumn !== '' && entry.resultColumn !== '' && (
            <LookupResult sheet={sheet} query={entry.query} searchColumn={entry.searchColumn} resultColumn={entry.resultColumn} />
          )}
        </div>
      ))}
    </div>
  );
}

interface LookupResultProps {
  sheet: SheetData;
  query: string;
  searchColumn: number;
  resultColumn: number;
}

function LookupResult({ sheet, query, searchColumn, resultColumn }: LookupResultProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const matchRow = sheet.rows.find((row) => {
    const cellValue = findCellValue(row, searchColumn);
    return cellValue !== undefined && String(cellValue).trim().toLowerCase() === normalizedQuery;
  });

  if (!matchRow) {
    return <p className="lookup-entry__result lookup-entry__result--empty">Sem correspondência encontrada.</p>;
  }

  const resultValue = formatCellValue(findCellValue(matchRow, resultColumn));

  return (
    <p className="lookup-entry__result">
      <span className="lookup-entry__result-label">Resultado:</span> {resultValue || '(vazio)'}
    </p>
  );
}
