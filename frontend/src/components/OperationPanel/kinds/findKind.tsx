import { useEffect, useRef, useState } from 'react';
import { findMatch } from '../../../services/datasetApi';
import type { CellRange } from '../../../types/cellRange';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import { RangePickerField, TableSelect, ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface FindFields {
  // The value to search for — typed directly, or chained from another operation's result, same
  // as lookup's own chainable query.
  input: ValueSource;
  sheetIndex: number | '';
  // Unlike lookup (a single search column, reading a value from a separate result column), find
  // scans a whole rectangular range for the match and reports where it landed — there's no
  // separate result column, the position itself is the result.
  range: CellRange | null;
}

function asFindFields(fields: OperationFields): FindFields {
  return fields as unknown as FindFields;
}

export const findKind: OperationKind = {
  id: 'find',

  createFields: (dataset): OperationFields => ({
    input: literalSource(''),
    sheetIndex: dataset.sheets.length === 1 ? 0 : '',
    range: null,
  } satisfies FindFields),

  canConfirm: (fields) => asFindFields(fields).range !== null,

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, rangePick, onStartRangePick, onFinishRangePick }) => {
    const f = asFindFields(fields);

    return (
      <>
        {dataset.sheets.length > 1 && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela"
              dataset={dataset}
              sheetIndex={f.sheetIndex}
              onSelect={(sheetIndex) => updateFields({ sheetIndex, range: null })}
            />
          </div>
        )}

        {f.sheetIndex !== '' && (
          <div className="operation-entry__columns">
            <RangePickerField
              label="Intervalo onde procurar"
              value={f.range}
              isPicking={rangePick?.entryId === entryId}
              pendingRange={rangePick?.entryId === entryId ? rangePick.range : null}
              onStart={() => onStartRangePick(entryId, f.sheetIndex as number)}
              onConfirm={(range) => updateFields({ range })}
              onCancel={onFinishRangePick}
            />
          </div>
        )}
      </>
    );
  },

  renderSummary: (fields, dataset) => {
    const f = asFindFields(fields);
    const sheetIndex = f.sheetIndex as number;
    const range = f.range as CellRange;
    return (
      <span>
        {dataset.sheets[sheetIndex].sheetName} · Linhas {range.startRow}-{range.endRow} · Colunas {range.startColumn}-
        {range.endColumn}
      </span>
    );
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asFindFields(fields);
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
    const f = asFindFields(fields);
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

        <FindResult
          datasetId={datasetId}
          query={query}
          sheetIndex={f.sheetIndex as number}
          range={f.range as CellRange}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onMatchChange={onMatchChange}
          onResultChange={onResultChange}
        />
      </>
    );
  },

  getColumnHighlights: () => [],

  getRangeHighlights: (fields) => {
    const f = asFindFields(fields);
    if (f.sheetIndex === '' || f.range === null) {
      return [];
    }
    return [{ sheetIndex: f.sheetIndex, ...f.range, role: 'search' as const, label: 'Onde procura' }];
  },

  // Unlike lookup, the matched column isn't a fixed field here (it's whatever column within the
  // range the match landed in) — the exact-cell highlight machinery (getCellHighlight) only ever
  // tracks a matched *row* against fixed search/result columns, so find falls back to the
  // whole-range tint above, same as sum's own aggregate result has no single cell to point at.
};

interface FindResultProps {
  datasetId: string;
  query: string;
  sheetIndex: number;
  range: CellRange;
  /** Incremented by "Testar modelo" (see OperationPanel) — the only thing that triggers a
   * request; editing the query/table/range afterward doesn't, until tested again. */
  testSignal: number;
  /** Incremented by "Limpar teste" — clears the shown result back to not-tested on demand. */
  resetSignal: number;
  onMatchChange: (rowIndex: number | null) => void;
  onResultChange: (value: string | null) => void;
}

type FindRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; found: boolean; rowIndex: number | null; columnIndex: number | null };

/**
 * Runs the operation entirely on the API: the dataset id, the range and the (resolved) query are
 * sent to /api/v1/dataset/operation/find, which scans the range and returns the position of the
 * first match — this component only renders the outcome, and only once "Testar modelo" is
 * actually clicked. Mirrors LookupResult's own request lifecycle (including why it's always
 * mounted, even with an empty/unresolved query — see that component's note on React StrictMode).
 */
function FindResult({ datasetId, query, sheetIndex, range, testSignal, resetSignal, onMatchChange, onResultChange }: FindResultProps) {
  const [state, setState] = useState<FindRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onMatchChange(null);
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Which testSignal we've already gotten a definitive response for — see the equivalent note in
  // LookupResult; a dynamic (chained) query catching up mid test-cycle must still fire once it
  // resolves, not be treated as a stale edit.
  const handledForSignalRef = useRef(0);
  const inFlightRef = useRef<{ signal: number; promise: ReturnType<typeof findMatch> } | null>(null);

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
            const promise = findMatch({
              datasetId,
              query,
              sheetIndex,
              startRow: range.startRow,
              endRow: range.endRow,
              startColumn: range.startColumn,
              endColumn: range.endColumn,
            });
            inFlightRef.current = { signal: testSignal, promise };
            return promise;
          })();

    request
      .then((response) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'done', found: response.found, rowIndex: response.rowIndex, columnIndex: response.columnIndex });
          onMatchChange(response.found ? response.rowIndex : null);
          onResultChange(response.found ? `${response.rowIndex},${response.columnIndex}` : null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao procurar a posição.' });
          onResultChange(null);
        }
      });

    return () => {
      cancelled = true;
      onMatchChange(null);
      onResultChange(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, query, sheetIndex, range.startRow, range.endRow, range.startColumn, range.endColumn]);

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

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Linha:</span> {state.rowIndex}
      {' · '}
      <span className="operation-entry__result-label">Coluna:</span> {state.columnIndex}
    </p>
  );
}
