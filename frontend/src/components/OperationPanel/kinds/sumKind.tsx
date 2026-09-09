import { useEffect, useRef, useState } from 'react';
import { sumColumn } from '../../../services/datasetApi';
import type { CellRange } from '../../../types/cellRange';
import { RangePickerField, TableSelect } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface SumFields {
  sheetIndex: number | '';
  range: CellRange | null;
}

function asSumFields(fields: OperationFields): SumFields {
  return fields as unknown as SumFields;
}

export const sumKind: OperationKind = {
  id: 'sum',

  createFields: (dataset): OperationFields => ({
    sheetIndex: dataset.sheets.length === 1 ? 0 : '',
    range: null,
  } satisfies SumFields),

  canConfirm: (fields) => asSumFields(fields).range !== null,

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, rangePick, onStartRangePick, onFinishRangePick }) => {
    const f = asSumFields(fields);

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
              label="Intervalo a somar"
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
    const f = asSumFields(fields);
    const sheetIndex = f.sheetIndex as number;
    const range = f.range as CellRange;
    return (
      <span>
        {dataset.sheets[sheetIndex].sheetName} · Linhas {range.startRow}-{range.endRow} · Colunas {range.startColumn}-
        {range.endColumn}
      </span>
    );
  },

  renderBody: ({ fields, datasetId, testSignal, resetSignal, onResultChange }) => {
    const f = asSumFields(fields);
    return (
      <SumResult
        datasetId={datasetId}
        sheetIndex={f.sheetIndex as number}
        range={f.range as CellRange}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    );
  },

  getColumnHighlights: () => [],

  getRangeHighlights: (fields) => {
    const f = asSumFields(fields);
    if (f.sheetIndex === '' || f.range === null) {
      return [];
    }
    return [{ sheetIndex: f.sheetIndex, ...f.range, role: 'search' as const, label: 'Onde soma' }];
  },

  // Sum has no single matched cell (it's an aggregate) — no exact-cell highlight. Hovering a
  // confirmed sum operation falls back to the whole-range tint (see OperationPanel).
};

interface SumResultProps {
  datasetId: string;
  sheetIndex: number;
  range: CellRange;
  /** Incremented by "Testar modelo" (see OperationPanel) — the only thing that triggers a
   * request; picking a new range afterward doesn't, until tested again. */
  testSignal: number;
  /** Incremented by "Limpar teste" — clears the shown result back to not-tested on demand. */
  resetSignal: number;
  onResultChange: (value: string | null) => void;
}

type SumRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; sum: number; cellsSummed: number };

/**
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the sheet and range are sent to
 * /api/v1/dataset/operation/sum, which filters and sums the numeric cells — this component only
 * renders the outcome, and only once "Testar modelo" is actually clicked: nothing shows (see the
 * 'idle' case below, rendering nothing) while the range is still being picked/changed, and no
 * request fires either — see the two effects below.
 */
function SumResult({ datasetId, sheetIndex, range, testSignal, resetSignal, onResultChange }: SumResultProps) {
  const [state, setState] = useState<SumRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // testSignal as of whenever this range last changed — the fetch effect below only actually
  // fetches once testSignal has moved past this baseline, i.e. an actual "Testar modelo" click
  // happened while mounted with this exact range, not merely because some other operation had
  // already been tested earlier.
  const testSignalBaselineRef = useRef(testSignal);

  // Hides any previous result (and re-arms the baseline above) the moment the range/table
  // changes — a stale result from an earlier test would otherwise keep showing after picking a
  // new range, easily mistaken for already reflecting it.
  useEffect(() => {
    testSignalBaselineRef.current = testSignal;
    setState({ status: 'idle' });
    onResultChange(null);
    // Intentionally excludes testSignal — a test click shouldn't reset the baseline it's the one
    // advancing past, only an actual range change should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetIndex, range.startRow, range.endRow, range.startColumn, range.endColumn]);

  useEffect(() => {
    if (testSignal === testSignalBaselineRef.current) {
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    sumColumn({
      datasetId,
      sheetIndex,
      startRow: range.startRow,
      endRow: range.endRow,
      startColumn: range.startColumn,
      endColumn: range.endColumn,
    })
      .then((response) => {
        if (!cancelled) {
          setState({ status: 'done', sum: response.sum, cellsSummed: response.cellsSummed });
          onResultChange(String(response.sum));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao somar o intervalo.' });
          onResultChange(null);
        }
      });

    return () => {
      cancelled = true;
      onResultChange(null);
    };
    // Deliberately reactive to testSignal alone — see the equivalent note in lookupKind.tsx's
    // LookupResult.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal]);

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A somar…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Soma:</span> {state.sum} ({state.cellsSummed}{' '}
      {state.cellsSummed === 1 ? 'célula' : 'células'})
    </p>
  );
}
