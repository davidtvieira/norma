import { useEffect, useState } from 'react';
import type { CellValue } from '../../../types/dataset';
import { lookupValue } from '../../../services/datasetApi';
import { formatCellValue } from '../../../utils/sheet';
import { ColumnPickerField, TableSelect } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface LookupFields {
  query: string;
  searchSheetIndex: number | '';
  resultSheetIndex: number | '';
  searchColumn: number | '';
  resultColumn: number | '';
}

function asLookupFields(fields: OperationFields): LookupFields {
  return fields as unknown as LookupFields;
}

export const lookupKind: OperationKind = {
  id: 'lookup',

  createFields: (): OperationFields => ({
    query: '',
    searchSheetIndex: '',
    resultSheetIndex: '',
    searchColumn: '',
    resultColumn: '',
  } satisfies LookupFields),

  canConfirm: (fields) => {
    const f = asLookupFields(fields);
    return f.searchColumn !== '' && f.resultColumn !== '';
  },

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, searching, startSearching, columnPick, onStartColumnPick, onFinishColumnPick }) => {
    const f = asLookupFields(fields);

    return (
      <>
        {!searching && (
          <button type="button" className="operation-entry__start-button" onClick={startSearching}>
            Procurar valor
          </button>
        )}

        {searching && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela onde procurar"
              dataset={dataset}
              sheetIndex={f.searchSheetIndex}
              onSelect={(sheetIndex) => updateFields({ searchSheetIndex: sheetIndex, searchColumn: '' })}
            />
            <TableSelect
              label="Tabela a devolver"
              dataset={dataset}
              sheetIndex={f.resultSheetIndex}
              onSelect={(sheetIndex) => updateFields({ resultSheetIndex: sheetIndex, resultColumn: '' })}
            />
          </div>
        )}

        {f.searchSheetIndex !== '' && f.resultSheetIndex !== '' && (
          <div className="operation-entry__columns">
            <ColumnPickerField
              label="Coluna onde procurar"
              value={f.searchColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'search'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'search' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'search', f.searchSheetIndex as number)}
              onConfirm={(column) => updateFields({ searchColumn: column })}
              onCancel={onFinishColumnPick}
              onClear={() => updateFields({ searchColumn: '' })}
            />
            <ColumnPickerField
              label="Coluna a devolver"
              value={f.resultColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'result'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'result' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'result', f.resultSheetIndex as number)}
              onConfirm={(column) => updateFields({ resultColumn: column })}
              onCancel={onFinishColumnPick}
              onClear={() => updateFields({ resultColumn: '' })}
            />
          </div>
        )}
      </>
    );
  },

  renderSummary: (fields, dataset) => {
    const f = asLookupFields(fields);
    const searchSheetIndex = f.searchSheetIndex as number;
    const resultSheetIndex = f.resultSheetIndex as number;
    return (
      <>
        <span>
          {dataset.sheets[searchSheetIndex].sheetName} · Coluna {f.searchColumn}
        </span>
        <span className="lookup-summary__arrow">→</span>
        <span>
          {dataset.sheets[resultSheetIndex].sheetName} · Coluna {f.resultColumn}
        </span>
      </>
    );
  },

  renderBody: ({ fields, updateFields, datasetId, onMatchChange }) => {
    const f = asLookupFields(fields);
    return (
      <>
        <input
          type="text"
          className="operation-entry__input"
          placeholder="Introduza um valor"
          value={f.query}
          onChange={(event) => updateFields({ query: event.target.value })}
        />

        {f.query.trim() !== '' && (
          <LookupResult
            datasetId={datasetId}
            query={f.query}
            searchSheetIndex={f.searchSheetIndex as number}
            resultSheetIndex={f.resultSheetIndex as number}
            searchColumn={f.searchColumn as number}
            resultColumn={f.resultColumn as number}
            onMatchChange={onMatchChange}
          />
        )}
      </>
    );
  },

  getColumnHighlights: (fields) => {
    const f = asLookupFields(fields);
    const highlights = [];
    if (f.searchSheetIndex !== '' && f.searchColumn !== '') {
      highlights.push({ sheetIndex: f.searchSheetIndex, column: f.searchColumn, role: 'search' as const });
    }
    if (f.resultSheetIndex !== '' && f.resultColumn !== '') {
      highlights.push({ sheetIndex: f.resultSheetIndex, column: f.resultColumn, role: 'result' as const });
    }
    return highlights;
  },

  getCellHighlight: (fields, matchedRow) => {
    if (matchedRow === null) return null;
    const f = asLookupFields(fields);
    if (f.searchSheetIndex === '' || f.resultSheetIndex === '' || f.searchColumn === '' || f.resultColumn === '') {
      return null;
    }
    return {
      searchSheetIndex: f.searchSheetIndex,
      searchColumn: f.searchColumn,
      resultSheetIndex: f.resultSheetIndex,
      resultColumn: f.resultColumn,
      rowIndex: matchedRow,
    };
  },
};

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
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the search/result table and column indexes are sent to
 * /api/v1/dataset/operation/lookup, which does the row matching and returns the value — this
 * component only renders the outcome. The request is debounced by LOOKUP_DEBOUNCE_MS so it
 * doesn't fire on every keystroke while the query is being typed.
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
    return <p className="operation-entry__result operation-entry__result--empty">A procurar…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  if (!state.found) {
    return <p className="operation-entry__result operation-entry__result--empty">Sem correspondência encontrada.</p>;
  }

  const resultValue = formatCellValue(state.value ?? undefined);

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Resultado:</span> {resultValue || '(vazio)'}
    </p>
  );
}
