import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useRef, useState } from 'react';
import { sumColumn } from '../../../services/datasetApi';
import type { CellRange } from '../../../types/cellRange';
import { IteratorSheetToggle, PageOverrideNotice, PageSheetNotice, RangePickerField, summarySheetName, TableSelect } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface SumFields {
  sheetIndex: number | '';
  // Run on the model's iterator's sheet instead of sheetIndex — see IteratorSheetToggle.
  useIteratorSheet: boolean;
  range: CellRange | null;
}

function asSumFields(fields: OperationFields): SumFields {
  return fields as unknown as SumFields;
}

export const sumKind: OperationKind = {
  id: 'sum',

  createFields: (dataset): OperationFields => ({
    sheetIndex: dataset.sheets.length === 1 ? 0 : '',
    useIteratorSheet: false,
    range: null,
  } satisfies SumFields),

  canConfirm: (fields) => asSumFields(fields).range !== null,

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, rangePick, onStartRangePick, onFinishRangePick, hasPageSelector }) => {
    const f = asSumFields(fields);

    return (
      <>
        {dataset.sheets.length > 1 && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela"
              dataset={dataset}
              sheetIndex={f.sheetIndex}
              disabled={hasPageSelector && f.sheetIndex !== ''}
              onSelect={(sheetIndex) => updateFields({ sheetIndex, range: null })}
            />
          </div>
        )}

        {dataset.sheets.length > 1 && <PageOverrideNotice active={hasPageSelector} />}

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

  renderSummary: (fields, dataset, pageSheet) => {
    const f = asSumFields(fields);
    const sheetIndex = f.sheetIndex as number;
    const range = f.range as CellRange;
    return (
      <span>
        {summarySheetName(sheetIndex, pageSheet, dataset)} · Linhas {range.startRow}-{range.endRow} · Colunas {range.startColumn}-
        {range.endColumn}
      </span>
    );
  },

  renderBody: ({
    fields,
    updateFields,
    datasetId,
    testSignal,
    resetSignal,
    pageSheet,
    sheetNames,
    iteratorSheet,
    onResultChange,
  }) => {
    const f = asSumFields(fields);
    // The model's page selector, when it has one, wins over the iterator's sheet.
    const sheetIndex =
      pageSheet !== null ? pageSheet : f.useIteratorSheet && iteratorSheet !== null ? iteratorSheet : f.sheetIndex;
    return (
      <>
        <IteratorSheetToggle
          iteratorSheet={iteratorSheet}
          checked={f.useIteratorSheet}
          onChange={(useIteratorSheet) => updateFields({ useIteratorSheet })}
        />

        <PageSheetNotice pageSheet={pageSheet} sheetNames={sheetNames} />

        <SumResult
          datasetId={datasetId}
          sheetIndex={sheetIndex as number}
          range={f.range as CellRange}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onResultChange={onResultChange}
        />
      </>
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
  onResultChange: (value: string | null, failed?: boolean) => void;
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
  // Set when a test click arrived while a page selector's page had not resolved yet (a negative
  // sheet): the page arriving afterwards must still run that test rather than re-arm the baseline.
  const waitingForPageRef = useRef(false);

  // Hides any previous result (and re-arms the baseline above) the moment the range/table
  // changes — a stale result from an earlier test would otherwise keep showing after picking a
  // new range, easily mistaken for already reflecting it.
  useEffect(() => {
    if (waitingForPageRef.current && sheetIndex >= 0) {
      waitingForPageRef.current = false;
      return;
    }
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

    if (sheetIndex < 0) {
      waitingForPageRef.current = true;
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
          setState({ status: 'error', message: inlineErrorMessage(error, 'Falha ao somar o intervalo.') });
          onResultChange(null, true);
        }
      });

    return () => {
      cancelled = true;
      onResultChange(null);
    };
    // Reactive to testSignal (see the equivalent note in lookupKind.tsx's LookupResult) and to the
    // page arriving after a test click (see waitingForPageRef) — nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, sheetIndex >= 0]);

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A somar…</p>;
  }

  if (state.status === 'error') {
    // Empty for an API failure — its toast already says so (see inlineErrorMessage).
    if (!state.message) return null;
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Soma:</span> {state.sum} ({state.cellsSummed}{' '}
      {state.cellsSummed === 1 ? 'célula' : 'células'})
    </p>
  );
}
