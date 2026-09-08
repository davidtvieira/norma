import { useEffect, useState } from 'react';
import type { CellValue } from '../../../types/dataset';
import { lookupValue } from '../../../services/datasetApi';
import { formatCellValue } from '../../../utils/sheet';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import { ColumnPickerField, TableSelect, ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface LookupFields {
  // The value to search for — typed directly, or chained from another operation's result.
  input: ValueSource;
  // Search and result columns always come from the same table — a lookup matches a row in one
  // table by its search column and reads the result from another column of that same row.
  sheetIndex: number | '';
  searchColumn: number | '';
  resultColumn: number | '';
}

function asLookupFields(fields: OperationFields): LookupFields {
  return fields as unknown as LookupFields;
}

export const lookupKind: OperationKind = {
  id: 'lookup',

  createFields: (dataset): OperationFields => ({
    input: literalSource(''),
    sheetIndex: dataset.sheets.length === 1 ? 0 : '',
    searchColumn: '',
    resultColumn: '',
  } satisfies LookupFields),

  canConfirm: (fields) => {
    const f = asLookupFields(fields);
    return f.searchColumn !== '' && f.resultColumn !== '';
  },

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, columnPick, onStartColumnPick, onFinishColumnPick }) => {
    const f = asLookupFields(fields);

    return (
      <>
        {dataset.sheets.length > 1 && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela"
              dataset={dataset}
              sheetIndex={f.sheetIndex}
              onSelect={(sheetIndex) => updateFields({ sheetIndex, searchColumn: '', resultColumn: '' })}
            />
          </div>
        )}

        {f.sheetIndex !== '' && (
          <div className="operation-entry__columns">
            <ColumnPickerField
              label="Coluna onde procurar"
              value={f.searchColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'search'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'search' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'search', f.sheetIndex as number)}
              onConfirm={(column) => updateFields({ searchColumn: column })}
              onCancel={onFinishColumnPick}
              onClear={() => updateFields({ searchColumn: '' })}
            />
            <ColumnPickerField
              label="Coluna a devolver"
              value={f.resultColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'result'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'result' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'result', f.sheetIndex as number)}
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
    const sheetIndex = f.sheetIndex as number;
    return (
      <>
        <span>{dataset.sheets[sheetIndex].sheetName}</span>
        <span>
          · Coluna {f.searchColumn}
          <span className="lookup-summary__arrow">→</span>
          Coluna {f.resultColumn}
        </span>
      </>
    );
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asLookupFields(fields);
    return (
      <ValueSourceField
        label="Valor a procurar"
        placeholder="Introduza um valor"
        inputType="text"
        source={f.input}
        onChange={(input) => updateFields({ input })}
        referenceOptions={[]}
        resolvedInput={resolvedInput}
      />
    );
  },

  renderBody: ({ fields, updateFields, datasetId, onMatchChange, resolvedInput, referenceOptions, onResultChange }) => {
    const f = asLookupFields(fields);
    const query = resolvedInput.status === 'ready' ? resolvedInput.value : '';
    return (
      <>
        <ValueSourceField
          label="Valor a procurar"
          placeholder="Introduza um valor"
          inputType="text"
          source={f.input}
          onChange={(input) => updateFields({ input })}
          referenceOptions={referenceOptions}
          resolvedInput={resolvedInput}
        />

        {resolvedInput.status === 'ready' && query.trim() !== '' && (
          <LookupResult
            datasetId={datasetId}
            query={query}
            sheetIndex={f.sheetIndex as number}
            searchColumn={f.searchColumn as number}
            resultColumn={f.resultColumn as number}
            onMatchChange={onMatchChange}
            onResultChange={onResultChange}
          />
        )}
      </>
    );
  },

  getColumnHighlights: (fields) => {
    const f = asLookupFields(fields);
    if (f.sheetIndex === '') {
      return [];
    }
    const highlights = [];
    if (f.searchColumn !== '') {
      highlights.push({ sheetIndex: f.sheetIndex, column: f.searchColumn, role: 'search' as const });
    }
    if (f.resultColumn !== '') {
      highlights.push({ sheetIndex: f.sheetIndex, column: f.resultColumn, role: 'result' as const });
    }
    return highlights;
  },

  getCellHighlight: (fields, matchedRow) => {
    if (matchedRow === null) return null;
    const f = asLookupFields(fields);
    if (f.sheetIndex === '' || f.searchColumn === '' || f.resultColumn === '') {
      return null;
    }
    return {
      searchSheetIndex: f.sheetIndex,
      searchColumn: f.searchColumn,
      resultSheetIndex: f.sheetIndex,
      resultColumn: f.resultColumn,
      rowIndex: matchedRow,
    };
  },
};

interface LookupResultProps {
  datasetId: string;
  query: string;
  sheetIndex: number;
  searchColumn: number;
  resultColumn: number;
  onMatchChange: (rowIndex: number | null) => void;
  onResultChange: (value: string | null) => void;
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
  sheetIndex,
  searchColumn,
  resultColumn,
  onMatchChange,
  onResultChange,
}: LookupResultProps) {
  const [state, setState] = useState<LookupRequestState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const timeoutId = window.setTimeout(() => {
      lookupValue({
        datasetId,
        query,
        searchSheetIndex: sheetIndex,
        searchColumn,
        resultSheetIndex: sheetIndex,
        resultColumn,
      })
        .then((response) => {
          if (!cancelled) {
            setState({ status: 'done', found: response.found, value: response.value });
            onMatchChange(response.found ? response.rowIndex : null);
            onResultChange(response.found ? String(response.value ?? '') : null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao procurar o valor.' });
            onResultChange(null);
          }
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      onMatchChange(null);
      onResultChange(null);
    };
    // onMatchChange/onResultChange are fresh closures from the parent every render but only ever
    // close over a stable id and a stable setState — safe to omit so they don't reset the
    // debounce timer on every unrelated keystroke elsewhere in the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, query, sheetIndex, searchColumn, resultColumn]);

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
