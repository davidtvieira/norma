import { CloseIcon } from '../../ButtonIcons/ButtonIcons';
import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { filterValues } from '../../../services/datasetApi';
import { literalSource, referenceFromKey, referenceKey, type ValueSource } from '../../../types/valueSource';
import type { FilterMode, FilterOperator } from '../../../types/filter';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface FilterFields {
  // "single": the inputs are compared with `value` through `operator`. "range": they must be numbers from `min` to `max`.
  mode: FilterMode;
  operator: FilterOperator;
  // The condition's operands. Each is typed (a static filter) or chained from another operation (a dynamic one).
  // Declared in this order on purpose: getInputSources (and therefore resolvedInputs) reads a kind's chainable fields in
  // object-key order, so resolvedInputs[0..2] are value, min, max and resolvedInputs[3 + i] is inputs[i]. The ones the
  // mode doesn't use stay an empty literal.
  value: ValueSource;
  min: ValueSource;
  max: ValueSource;
  // The values to check, each against the same condition. Only the ones that meet it are output (the input itself).
  inputs: ValueSource[];
}

const CONDITION_FIELDS = 3;

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'é igual a',
  ne: 'é diferente de',
  contains: 'contém',
  startsWith: 'começa por',
  endsWith: 'acaba em',
  gt: 'é maior que',
  gte: 'é maior ou igual a',
  lt: 'é menor que',
  lte: 'é menor ou igual a',
};

function asFilterFields(fields: OperationFields): FilterFields {
  return fields as unknown as FilterFields;
}

function filterMode(f: FilterFields): FilterMode {
  return f.mode === 'range' ? 'range' : 'single';
}

function isUnsetLiteral(source: ValueSource): boolean {
  return source.type === 'literal' && source.value.trim() === '';
}

/** Whether the condition has what it needs: a value to compare with, or at least one limit of the range. */
function conditionIsSet(f: FilterFields): boolean {
  return filterMode(f) === 'range' ? !(isUnsetLiteral(f.min) && isUnsetLiteral(f.max)) : !isUnsetLiteral(f.value);
}

export const filterKind: OperationKind = {
  id: 'filter',
  requiresDataset: false,

  createFields: (): OperationFields => ({
    mode: 'single',
    operator: 'eq',
    value: literalSource(''),
    min: literalSource(''),
    max: literalSource(''),
    inputs: [literalSource('')],
  } satisfies FilterFields),

  // The condition is part of what the operation is, so it must be complete before it is confirmed.
  canConfirm: (fields) => conditionIsSet(asFilterFields(fields)),

  // The condition, written once when the operation is created: what kind it is and its value or limits. The card then
  // only holds the inputs, which are what changes from run to run.
  renderDraftConfig: ({ fields, updateFields }) => {
    const f = asFilterFields(fields);
    const mode = filterMode(f);

    // Switching mode starts the operands over: a value and the limits of a range don't mean the same thing.
    const chooseMode = (next: FilterMode) => {
      if (next !== mode) updateFields({ mode: next, value: literalSource(''), min: literalSource(''), max: literalSource('') });
    };

    const operandInput = (label: string, key: 'value' | 'min' | 'max', placeholder: string, inputMode: 'text' | 'decimal') => {
      const source = f[key];
      return (
        <div className="operation-entry__field">
          <label className="operation-entry__label">{label}</label>
          <input
            type="text"
            inputMode={inputMode}
            className="operation-entry__input"
            placeholder={placeholder}
            value={source.type === 'literal' ? source.value : ''}
            onChange={(event) => updateFields({ [key]: literalSource(event.target.value) })}
          />
        </div>
      );
    };

    return (
      <>
        <div className="operation-entry__field">
          <label className="operation-entry__label">Condição</label>
          <div className="operation-entry__source-toggle">
            <button
              type="button"
              className={`operation-entry__source-toggle-button${mode === 'single' ? ' operation-entry__source-toggle-button--active' : ''}`}
              aria-pressed={mode === 'single'}
              onClick={() => chooseMode('single')}
            >
              Única
            </button>
            <button
              type="button"
              className={`operation-entry__source-toggle-button${mode === 'range' ? ' operation-entry__source-toggle-button--active' : ''}`}
              aria-pressed={mode === 'range'}
              onClick={() => chooseMode('range')}
            >
              Intervalo
            </button>
          </div>
          <p className="operation-entry__chain-status">
            {mode === 'single'
              ? 'Cada entrada é comparada com um valor.'
              : 'Cada entrada tem de ser um número dentro do intervalo. Os limites contam; deixe um vazio para "sem limite".'}
          </p>
        </div>

        {mode === 'single' ? (
          <>
            <div className="operation-entry__field">
              <label className="operation-entry__label">A entrada</label>
              <select
                className="operation-entry__select"
                value={f.operator}
                onChange={(event) => updateFields({ operator: event.target.value as FilterOperator })}
              >
                {(Object.keys(OPERATOR_LABELS) as FilterOperator[]).map((operator) => (
                  <option key={operator} value={operator}>
                    {OPERATOR_LABELS[operator]}
                  </option>
                ))}
              </select>
            </div>
            {operandInput('Valor', 'value', 'Introduza o valor', 'text')}
          </>
        ) : (
          <>
            {operandInput('Mínimo (opcional)', 'min', 'Sem limite inferior', 'decimal')}
            {operandInput('Máximo (opcional)', 'max', 'Sem limite superior', 'decimal')}
          </>
        )}
      </>
    );
  },

  renderSummary: (fields) => {
    const f = asFilterFields(fields);
    const inputs = f.inputs.length;
    return (
      <span>
        {filterMode(f) === 'range' ? 'Intervalo' : OPERATOR_LABELS[f.operator]} · {inputs} {inputs === 1 ? 'entrada' : 'entradas'}
      </span>
    );
  },

  // How many inputs pass is only known at run time, so each possible output is just numbered.
  getOutputLabels: (fields) => {
    const inputs = asFilterFields(fields).inputs;
    if (inputs.length < 2) return null;
    return inputs.map((_, index) => `Saída ${index + 1}`);
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, resolvedInputs, referenceOptions, onResultChange, onOutputsChange }) => {
    const f = asFilterFields(fields);
    return (
      <FilterEditor
        fields={f}
        updateFields={updateFields}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
        onOutputsChange={onOutputsChange}
      />
    );
  },

  getColumnHighlights: () => [],

  // A filter isn't tied to any table/column/range — nothing on the sheet to tint.
};

interface FilterRow {
  id: string;
  source: ValueSource;
}

let rowIdSeq = 0;
function nextRowId(): string {
  rowIdSeq += 1;
  return `filter-row-${rowIdSeq}`;
}

type FilterRequestState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; values: string[]; sources: number[] };

interface FilterEditorProps {
  fields: FilterFields;
  updateFields: (patch: OperationFields) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
  onOutputsChange: (values: (string | null)[]) => void;
}

/**
 * The editable list of inputs (rows keep stable ids, like a calc's, so removing one from the
 * middle doesn't hand its field state to the next), plus the live result: only once "Testar modelo" is clicked, the
 * resolved values go to /api/v1/dataset/operation/filter, which does the check. Only the inputs that meet the condition come
 * back, each as an output (possibly none); the others are skipped.
 */
function FilterEditor({
  fields,
  updateFields,
  referenceOptions,
  resolvedInputs,
  testSignal,
  resetSignal,
  onResultChange,
  onOutputsChange,
}: FilterEditorProps) {
  const mode = filterMode(fields);
  const [rows, setRows] = useState<FilterRow[]>(() => fields.inputs.map((source) => ({ id: nextRowId(), source })));
  const [state, setState] = useState<FilterRequestState>({ status: 'idle' });

  function commit(nextRows: FilterRow[]) {
    setRows(nextRows);
    updateFields({ inputs: nextRows.map((row) => row.source) });
  }

  const missing: ResolvedInput = { status: 'missing' };
  const resolvedKey = resolvedInputs.map((input) => (input.status === 'ready' ? `ready:${input.value}` : input.status)).join('|');
  const conditionKey = JSON.stringify([mode, fields.operator]);

  // "Limpar dados": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    onOutputsChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0 || resolvedInputs.length <= CONDITION_FIELDS) {
      return;
    }

    // An input or a condition operand still unset: a true no-op that leaves whatever is shown alone (see CalcInputs).
    if (!conditionIsSet(fields) || fields.inputs.some(isUnsetLiteral)) {
      return;
    }

    // Only the operands the mode uses count: an unused one is an empty literal anyway.
    const [value, min, max, ...inputs] = resolvedInputs;
    const used = [...(mode === 'range' ? [min, max] : [value]), ...inputs];

    if (used.some((input) => input.status === 'cycle')) {
      setState({ status: 'error', message: 'Referência circular entre operações.' });
      onResultChange(null, true);
      return;
    }

    if (used.some((input) => input.status === 'missing')) {
      setState({ status: 'error', message: 'Uma das entradas ou da condição já não existe.' });
      onResultChange(null, true);
      return;
    }

    if (used.some((input) => input.status === 'pending')) {
      setState({ status: 'waiting' });
      onResultChange(null);
      onOutputsChange([]);
      return;
    }

    const read = (input: ResolvedInput) => (input.status === 'ready' ? input.value : '');

    let cancelled = false;
    setState({ status: 'loading' });

    filterValues({
      mode,
      ...(mode === 'range' ? { min: read(min), max: read(max) } : { operator: fields.operator, value: read(value) }),
      values: inputs.map(read),
    })
      .then((response) => {
        if (cancelled) return;
        setState({ status: 'done', values: response.values, sources: response.sources });
        onOutputsChange(response.values);
        onResultChange(response.values.length === 1 ? response.values[0] : null);
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: 'error', message: inlineErrorMessage(error, 'Falha ao filtrar os valores.') });
        onOutputsChange([]);
        onResultChange(null, true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, conditionKey]);

  // What an output is called: the input it came from (the operation it references, or the value typed).
  function inputLabel(position: number): string {
    const source = rows[position]?.source;
    if (!source) return `Entrada ${position + 1}`;
    if (source.type === 'reference') {
      return referenceOptions.find((option) => option.operationId === referenceKey(source))?.label ?? `Entrada ${position + 1}`;
    }
    return source.value.trim() || `Entrada ${position + 1}`;
  }

  return (
    <>
      {rows.map((row, index) => {
        const removeRow = () => commit(rows.filter((current) => current.id !== row.id));
        return (
          <div key={row.id} className="list-entry__input-row">
            <div className="list-entry__input-field">
              <ValueSourceField
                label={`Entrada ${index + 1}`}
                placeholder="Introduza um valor"
                inputType="text"
                source={row.source}
                onChange={(source) => commit(rows.map((current) => (current.id === row.id ? { ...current, source } : current)))}
                referenceOptions={referenceOptions}
                resolvedInput={resolvedInputs[CONDITION_FIELDS + index] ?? missing}
                onRemove={removeRow}
                // Several references picked at once: the first fills this row, each other gets a new row right after it.
                onPickMany={(keys) =>
                  commit(
                    rows.flatMap((current) =>
                      current.id !== row.id
                        ? [current]
                        : keys.map((key, pickIndex) => ({
                            id: pickIndex === 0 ? current.id : nextRowId(),
                            source: referenceFromKey(key),
                          })),
                    ),
                  )
                }
              />
            </div>
            {row.source.type !== 'reference' && (
              <button
                type="button"
                className="operation-entry__reset-button list-entry__remove-input"
                onClick={removeRow}
                aria-label="Remover entrada"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn--secondary btn--sm btn--block"
        onClick={() => commit([...rows, { id: nextRowId(), source: literalSource('') }])}
      >
        + Adicionar entrada
      </button>

      {state.status === 'loading' && <p className="operation-entry__result operation-entry__result--empty">A filtrar…</p>}

      {state.status === 'error' && (
        <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>
      )}

      {state.status === 'done' && state.values.length === 0 && (
        <p className="operation-entry__result operation-entry__result--empty">Nenhuma entrada cumpre a condição.</p>
      )}

      {state.status === 'done' &&
        state.values.map((value, index) => (
          <p key={`${state.sources[index]}-${index}`} className="operation-entry__result">
            <span className="operation-entry__result-label">{inputLabel(state.sources[index])}:</span> {value || '(vazio)'}
          </p>
        ))}
    </>
  );
}
