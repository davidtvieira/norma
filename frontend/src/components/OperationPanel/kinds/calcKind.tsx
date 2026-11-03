import { CloseIcon } from '../../ButtonIcons/ButtonIcons';
import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { calcValues } from '../../../services/datasetApi';
import type { CalcFormat, CalcOperation } from '../../../types/calc';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface CalcFields {
  // Every value to combine, in order — typed directly, chained from other operations' results, or a column. Declared
  // in this order: resolvedInputs mirrors it (see getInputSources).
  inputs: ValueSource[];
  operation: CalcOperation;
  format: CalcFormat;
}

const OPERATION_LABELS: Record<CalcOperation, string> = {
  add: 'Somar (valor 1 + valor 2 + …)',
  subtract: 'Subtrair (valor 1 − valor 2 − …)',
  multiply: 'Multiplicar (valor 1 × valor 2 × …)',
  divide: 'Dividir (valor 1 ÷ valor 2 ÷ …)',
};

const OPERATION_NAMES: Record<CalcOperation, string> = {
  add: 'Somar',
  subtract: 'Subtrair',
  multiply: 'Multiplicar',
  divide: 'Dividir',
};

const FORMAT_LABELS: Record<CalcFormat, string> = {
  none: 'Tal como está',
  round: 'Arredondado (inteiro)',
  abs: 'Valor absoluto',
};

function asCalcFields(fields: OperationFields): CalcFields {
  return fields as unknown as CalcFields;
}

/**
 * Arithmetic on two or more values: add, subtract, multiply or divide them (the first, then each of the rest in turn),
 * with the result optionally rounded to an integer or turned into its absolute value. It has no table/column/range, so
 * the only thing to set up before confirming is which operation and format (renderDraftConfig); the values are edited on
 * the confirmed card, like every other kind's chainable fields.
 */
export const calcKind: OperationKind = {
  id: 'calc',
  requiresDataset: false,

  createFields: (): OperationFields => ({
    inputs: [literalSource(''), literalSource('')],
    operation: 'add',
    format: 'none',
  } satisfies CalcFields),

  canConfirm: () => true,

  renderDraftConfig: ({ fields, updateFields }) => {
    const f = asCalcFields(fields);
    return (
      <>
        <div className="operation-entry__field">
          <label className="operation-entry__label">Operação</label>
          <select
            className="operation-entry__select"
            value={f.operation}
            onChange={(event) => updateFields({ operation: event.target.value as CalcOperation })}
          >
            {(Object.keys(OPERATION_LABELS) as CalcOperation[]).map((operation) => (
              <option key={operation} value={operation}>
                {OPERATION_LABELS[operation]}
              </option>
            ))}
          </select>
        </div>

        <div className="operation-entry__field">
          <label className="operation-entry__label">Formato do resultado</label>
          <select
            className="operation-entry__select"
            value={f.format}
            onChange={(event) => updateFields({ format: event.target.value as CalcFormat })}
          >
            {(Object.keys(FORMAT_LABELS) as CalcFormat[]).map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </div>
      </>
    );
  },

  renderSummary: (fields) => {
    const f = asCalcFields(fields);
    const count = f.inputs.length;
    return (
      <span>
        {OPERATION_NAMES[f.operation]}
        {count > 2 && ` · ${count} valores`}
        {f.format !== 'none' && ` · ${FORMAT_LABELS[f.format].toLowerCase()}`}
      </span>
    );
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, resolvedInputs, referenceOptions, onResultChange }) => {
    const f = asCalcFields(fields);
    return (
      <>
        <CalcInputs
          inputs={f.inputs}
          onChange={(inputs) => updateFields({ inputs })}
          referenceOptions={referenceOptions}
          resolvedInputs={resolvedInputs}
        />

        <CalcResult
          inputs={resolvedInputs}
          operation={f.operation}
          format={f.format}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onResultChange={onResultChange}
        />
      </>
    );
  },

  getColumnHighlights: () => [],
};

interface CalcRow {
  id: string;
  source: ValueSource;
}

let rowIdSeq = 0;
function nextRowId(): string {
  rowIdSeq += 1;
  return `calc-row-${rowIdSeq}`;
}

interface CalcInputsProps {
  inputs: ValueSource[];
  onChange: (inputs: ValueSource[]) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
}

/**
 * The editable list of a calc's values: at least two, each one fixed, from another operation or a column, with
 * "+ Adicionar valor" for more. Each row has an id of its own, independent of its position, so removing one from the
 * middle doesn't hand its picker state to the row that moves up into its place (see the same note on CalcInputs).
 */
function CalcInputs({ inputs, onChange, referenceOptions, resolvedInputs }: CalcInputsProps) {
  const [rows, setRows] = useState<CalcRow[]>(() => inputs.map((source) => ({ id: nextRowId(), source })));

  function commit(nextRows: CalcRow[]) {
    setRows(nextRows);
    onChange(nextRows.map((row) => row.source));
  }

  return (
    <>
      {rows.map((row, index) => (
        <div key={row.id} className="list-entry__input-row">
          <div className="list-entry__input-field">
            <ValueSourceField
              label={`Valor ${index + 1}`}
              placeholder="Introduza um número"
              inputType="text"
              source={row.source}
              onChange={(source) => commit(rows.map((current) => (current.id === row.id ? { ...current, source } : current)))}
              referenceOptions={referenceOptions}
              resolvedInput={resolvedInputs[index] ?? { status: 'missing' }}
            />
          </div>
          {rows.length > 2 && (
            <button
              type="button"
              className="operation-entry__reset-button list-entry__remove-input"
              onClick={() => commit(rows.filter((current) => current.id !== row.id))}
              aria-label="Remover valor"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        className="btn btn--secondary btn--sm btn--block"
        onClick={() => commit([...rows, { id: nextRowId(), source: literalSource('') }])}
      >
        + Adicionar valor
      </button>
    </>
  );
}

interface CalcResultProps {
  /** The values to combine, in order. */
  inputs: ResolvedInput[];
  operation: CalcOperation;
  format: CalcFormat;
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

type CalcRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: number };

/**
 * Runs the operation on the API, same as CalcResult: the frontend only resolves which values the
 * inputs currently stand for, the arithmetic happens server-side (POST
 * /api/v1/dataset/operation/calc) — and only once "Testar modelo" has been clicked. It has no "already answered this click" latch, so a chained input catching up
 * mid-test still produces its result.
 */
function CalcResult({ inputs, operation, format, testSignal, resetSignal, onResultChange }: CalcResultProps) {
  const [state, setState] = useState<CalcRequestState>({ status: 'idle' });

  const resolvedKey = inputs.map((input) => (input.status === 'ready' ? `ready:${input.value}` : input.status)).join('|');

  // "Limpar dados": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0) {
      return;
    }

    if (inputs.some((input) => input.status === 'cycle')) {
      setState({ status: 'error', message: 'Referência circular entre operações.' });
      onResultChange(null, true);
      return;
    }

    if (inputs.some((input) => input.status === 'missing')) {
      setState({ status: 'error', message: 'Uma das entradas já não existe.' });
      onResultChange(null, true);
      return;
    }

    // A chained input that hasn't produced its result yet: nothing to calculate until it has.
    if (inputs.some((input) => input.status === 'pending')) {
      setState({ status: 'idle' });
      onResultChange(null);
      return;
    }

    // An empty value has nothing to calculate yet — a true no-op, leaving whatever is shown.
    const values = inputs.map((input) => (input.status === 'ready' ? input.value : ''));
    if (values.some((value) => value.trim() === '')) {
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    calcValues({ values, operation, format })
      .then((response) => {
        if (!cancelled) {
          setState({ status: 'done', value: response.value });
          onResultChange(String(response.value));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', message: inlineErrorMessage(error, 'Falha ao calcular.') });
          onResultChange(null, true);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, operation, format]);

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A calcular…</p>;
  }

  if (state.status === 'error') {
    // Empty for an API failure — its toast already says so (see inlineErrorMessage).
    if (!state.message) return null;
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Resultado:</span> {state.value}
    </p>
  );
}
