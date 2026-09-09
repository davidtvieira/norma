import { useEffect, useRef, useState } from 'react';
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
            />
            <ColumnPickerField
              label="Coluna a devolver"
              value={f.resultColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'result'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'result' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'result', f.sheetIndex as number)}
              onConfirm={(column) => updateFields({ resultColumn: column })}
              onCancel={onFinishColumnPick}
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

  renderBody: ({ fields, updateFields, datasetId, testSignal, resetSignal, onMatchChange, resolvedInput, referenceOptions, onResultChange }) => {
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

        <LookupResult
          datasetId={datasetId}
          query={query}
          sheetIndex={f.sheetIndex as number}
          searchColumn={f.searchColumn as number}
          resultColumn={f.resultColumn as number}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onMatchChange={onMatchChange}
          onResultChange={onResultChange}
        />
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
  /** Incremented by "Testar modelo" (see OperationPanel) — the only thing that triggers a
   * request; editing the query/table/columns afterward doesn't, until tested again. */
  testSignal: number;
  /** Incremented by "Limpar teste" — clears the shown result back to not-tested on demand. */
  resetSignal: number;
  onMatchChange: (rowIndex: number | null) => void;
  onResultChange: (value: string | null) => void;
}

type LookupRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; found: boolean; value: CellValue | null };

/**
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the search/result table and column indexes are sent to
 * /api/v1/dataset/operation/lookup, which does the row matching and returns the value — this
 * component only renders the outcome, and only once "Testar modelo" is actually clicked: nothing
 * shows (see the 'idle' case below, rendering nothing) while the query/table/columns are still
 * being typed/changed (or, for a dynamic query, not resolved yet), and no request fires either —
 * see the effect below. Always mounted (even with an empty/unresolved query) rather than only
 * once ready: mounting late — right as a dynamic query resolves mid test-cycle — would otherwise
 * hit React StrictMode's dev-only mount→cleanup→mount double-invoke exactly when "Testar modelo"
 * was clicked, firing two real requests for that one click (one always discarded, but still an
 * extra call) instead of the single request every other, already-mounted operation makes.
 */
function LookupResult({
  datasetId,
  query,
  sheetIndex,
  searchColumn,
  resultColumn,
  testSignal,
  resetSignal,
  onMatchChange,
  onResultChange,
}: LookupResultProps) {
  const [state, setState] = useState<LookupRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onMatchChange(null);
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Which testSignal we've already gotten a definitive response (success or error) for — starts
  // at 0, "never tested". A *dynamic* query (chained from another operation's result) can go from
  // empty to a real value right after "Testar modelo" is clicked, once its upstream operation's
  // own fetch resolves — that's still the same test round, so the fetch below must still fire
  // once the query catches up, not be treated as a stale edit (a naive "reset on any query
  // change" would otherwise silently swallow every chained lookup's result — the query change IS
  // the test arriving, not the user editing something). Only a query/column change once we've
  // *already* gotten a response for the current testSignal is a genuine post-test edit, which
  // clears back to idle instead, waiting for the next "Testar modelo" click.
  const handledForSignalRef = useRef(0);

  // The in-flight request for the current testSignal, if one's already been started — reused
  // instead of starting a second one. React StrictMode runs mount → cleanup → mount again in dev;
  // both mounts execute synchronously back to back, well before either could see the other's
  // result, so a ref that only records "done" *after* the request resolves can't stop the second
  // mount from firing its own duplicate call in the meantime. Recording (and reusing) the in-flight
  // *promise itself*, synchronously, does: the second mount finds it already there and subscribes
  // to that same promise instead of calling lookupValue again, so only one real request ever goes
  // out no matter how many times the effect is (re)invoked for the same testSignal.
  const inFlightRef = useRef<{ signal: number; promise: ReturnType<typeof lookupValue> } | null>(null);

  useEffect(() => {
    if (testSignal === 0 || query.trim() === '') {
      return;
    }

    if (testSignal === handledForSignalRef.current) {
      setState({ status: 'idle' });
      onMatchChange(null);
      onResultChange(null);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const request =
      inFlightRef.current && inFlightRef.current.signal === testSignal
        ? inFlightRef.current.promise
        : (() => {
            const promise = lookupValue({
              datasetId,
              query,
              searchSheetIndex: sheetIndex,
              searchColumn,
              resultSheetIndex: sheetIndex,
              resultColumn,
            });
            inFlightRef.current = { signal: testSignal, promise };
            return promise;
          })();

    request
      .then((response) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'done', found: response.found, value: response.value });
          onMatchChange(response.found ? response.rowIndex : null);
          onResultChange(response.found ? String(response.value ?? '') : null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao procurar o valor.' });
          onResultChange(null);
        }
      });

    return () => {
      cancelled = true;
      onMatchChange(null);
      onResultChange(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, query, sheetIndex, searchColumn, resultColumn]);

  if (state.status === 'idle') {
    return null;
  }

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
