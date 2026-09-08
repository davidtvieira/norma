import { useEffect, useState } from 'react';
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
              onClear={() => updateFields({ range: null })}
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

  renderBody: ({ fields, datasetId, onResultChange }) => {
    const f = asSumFields(fields);
    return <SumResult datasetId={datasetId} sheetIndex={f.sheetIndex as number} range={f.range as CellRange} onResultChange={onResultChange} />;
  },

  getColumnHighlights: () => [],

  getRangeHighlights: (fields) => {
    const f = asSumFields(fields);
    if (f.sheetIndex === '' || f.range === null) {
      return [];
    }
    return [{ sheetIndex: f.sheetIndex, ...f.range, role: 'search' as const }];
  },

  // Sum has no single matched cell (it's an aggregate) — no exact-cell highlight. Hovering a
  // confirmed sum operation falls back to the whole-range tint (see OperationPanel).
};

interface SumResultProps {
  datasetId: string;
  sheetIndex: number;
  range: CellRange;
  onResultChange: (value: string | null) => void;
}

type SumRequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; sum: number; cellsSummed: number };

/**
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the sheet and range are sent to
 * /api/v1/dataset/operation/sum, which filters and sums the numeric cells — this component
 * only renders the outcome. Fires immediately on a new range (no debounce needed — a drag
 * selection is a single discrete event, not a keystroke stream).
 */
function SumResult({ datasetId, sheetIndex, range, onResultChange }: SumResultProps) {
  const [state, setState] = useState<SumRequestState>({ status: 'loading' });

  useEffect(() => {
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
    // onResultChange is a fresh closure from the parent every render but only ever closes over
    // a stable id and a stable setState — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, sheetIndex, range.startRow, range.endRow, range.startColumn, range.endColumn]);

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
