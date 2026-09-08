import { useEffect, useState } from 'react';
import { sumColumn } from '../../../services/datasetApi';
import { ColumnPickerField, TableSelect } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface SumFields {
  // The row to start summing from (inclusive), typed as text.
  startRow: string;
  sheetIndex: number | '';
  column: number | '';
}

function asSumFields(fields: OperationFields): SumFields {
  return fields as unknown as SumFields;
}

export const sumKind: OperationKind = {
  id: 'sum',

  createFields: (): OperationFields => ({
    startRow: '',
    sheetIndex: '',
    column: '',
  } satisfies SumFields),

  canConfirm: (fields) => asSumFields(fields).column !== '',

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, searching, startSearching, columnPick, onStartColumnPick, onFinishColumnPick }) => {
    const f = asSumFields(fields);

    return (
      <>
        {!searching && (
          <button type="button" className="operation-entry__start-button" onClick={startSearching}>
            Selecionar coluna
          </button>
        )}

        {searching && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela"
              dataset={dataset}
              sheetIndex={f.sheetIndex}
              onSelect={(sheetIndex) => updateFields({ sheetIndex, column: '' })}
            />
          </div>
        )}

        {f.sheetIndex !== '' && (
          <div className="operation-entry__columns">
            <ColumnPickerField
              label="Coluna a somar"
              value={f.column}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'search'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'search' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'search', f.sheetIndex as number)}
              onConfirm={(column) => updateFields({ column })}
              onCancel={onFinishColumnPick}
              onClear={() => updateFields({ column: '' })}
            />
          </div>
        )}
      </>
    );
  },

  renderSummary: (fields, dataset) => {
    const f = asSumFields(fields);
    const sheetIndex = f.sheetIndex as number;
    return (
      <span>
        {dataset.sheets[sheetIndex].sheetName} · Coluna {f.column}
      </span>
    );
  },

  renderBody: ({ fields, updateFields, datasetId }) => {
    const f = asSumFields(fields);
    return (
      <>
        <input
          type="number"
          className="operation-entry__input"
          placeholder="Linha inicial"
          min={0}
          value={f.startRow}
          onChange={(event) => updateFields({ startRow: event.target.value })}
        />

        {f.startRow.trim() !== '' && (
          <SumResult
            datasetId={datasetId}
            sheetIndex={f.sheetIndex as number}
            column={f.column as number}
            startRow={f.startRow}
          />
        )}
      </>
    );
  },

  getColumnHighlights: (fields) => {
    const f = asSumFields(fields);
    if (f.sheetIndex === '' || f.column === '') {
      return [];
    }
    return [{ sheetIndex: f.sheetIndex, column: f.column, role: 'search' as const }];
  },

  // Sum has no single matched cell (it's an aggregate) — no exact-cell highlight. Hovering a
  // confirmed sum operation falls back to the whole-column tint (see OperationPanel).
};

interface SumResultProps {
  datasetId: string;
  sheetIndex: number;
  column: number;
  startRow: string;
}

type SumRequestState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }
  | { status: 'done'; sum: number; rowsSummed: number };

const SUM_DEBOUNCE_MS = 2000;

/**
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the sheet/column and start row are sent to
 * /api/v1/dataset/operation/sum, which filters and sums the numeric cells — this component
 * only renders the outcome. The request is debounced by SUM_DEBOUNCE_MS so it doesn't fire on
 * every keystroke while the start row is being typed.
 */
function SumResult({ datasetId, sheetIndex, column, startRow }: SumResultProps) {
  const [state, setState] = useState<SumRequestState>({ status: 'loading' });

  useEffect(() => {
    const parsedStartRow = Number(startRow);
    if (!Number.isInteger(parsedStartRow) || parsedStartRow < 0) {
      setState({ status: 'invalid' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const timeoutId = window.setTimeout(() => {
      sumColumn({ datasetId, sheetIndex, column, startRow: parsedStartRow })
        .then((response) => {
          if (!cancelled) {
            setState({ status: 'done', sum: response.sum, rowsSummed: response.rowsSummed });
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao somar a coluna.' });
          }
        });
    }, SUM_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [datasetId, sheetIndex, column, startRow]);

  if (state.status === 'invalid') {
    return <p className="operation-entry__result operation-entry__result--empty">Introduza uma linha inicial válida (0 ou mais).</p>;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A somar…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Soma:</span> {state.sum} ({state.rowsSummed}{' '}
      {state.rowsSummed === 1 ? 'linha' : 'linhas'})
    </p>
  );
}
