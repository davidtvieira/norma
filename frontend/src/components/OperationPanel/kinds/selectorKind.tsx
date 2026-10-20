import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { selectValue } from '../../../services/datasetApi';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface SelectorFields {
  // Declared in this order on purpose: getInputSources (and therefore resolvedInputs) reads a
  // kind's chainable fields in object-key order, so resolvedInputs[0] is always the index and
  // resolvedInputs[1 + i] is inputs[i].
  index: ValueSource;
  // The values to pick from, in order — each typed directly or chained from another operation.
  inputs: ValueSource[];
}

function asSelectorFields(fields: OperationFields): SelectorFields {
  return fields as unknown as SelectorFields;
}

/**
 * Picks one of its inputs by a zero-based index (index 1 over a, b, c gives b) — like counter and
 * node it has no table/column/range, so there's nothing to configure before confirming (see
 * renderDraftConfig below); the index and inputs are edited on the confirmed card (renderBody).
 * Both can be typed or chained, unlike counter's reference-only inputs: choosing between a few
 * typed values is as legitimate a use as choosing between other operations' results.
 */
export const selectorKind: OperationKind = {
  id: 'selector',

  createFields: (): OperationFields => ({
    index: literalSource(''),
    inputs: [],
  } satisfies SelectorFields),

  canConfirm: () => true,

  renderDraftConfig: () => null,

  renderSummary: (fields) => {
    const count = asSelectorFields(fields).inputs.length;
    return <span>{count} {count === 1 ? 'entrada' : 'entradas'}</span>;
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, referenceOptions, resolvedInputs, onResultChange }) => {
    const f = asSelectorFields(fields);
    return (
      <SelectorFieldsEditor
        index={f.index}
        inputs={f.inputs}
        onIndexChange={(index) => updateFields({ index })}
        onInputsChange={(inputs) => updateFields({ inputs })}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    );
  },

  getColumnHighlights: () => [],

  // A selector isn't tied to any table/column/range — nothing on the sheet to tint.
};

interface SelectorRow {
  id: string;
  source: ValueSource;
}

let rowIdSeq = 0;
function nextRowId(): string {
  rowIdSeq += 1;
  return `selector-row-${rowIdSeq}`;
}

interface SelectorFieldsEditorProps {
  index: ValueSource;
  inputs: ValueSource[];
  onIndexChange: (index: ValueSource) => void;
  onInputsChange: (inputs: ValueSource[]) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

/**
 * The index field plus the editable list of inputs, and the live result (SelectorResult below).
 * Rows get their own stable ids for the same reason counter's do (see CounterInputs): removing a
 * middle row must not shift a later row into an earlier row's ValueSourceField, which keeps its
 * own toggle state locally.
 */
function SelectorFieldsEditor({
  index,
  inputs,
  onIndexChange,
  onInputsChange,
  referenceOptions,
  resolvedInputs,
  testSignal,
  resetSignal,
  onResultChange,
}: SelectorFieldsEditorProps) {
  const [rows, setRows] = useState<SelectorRow[]>(() => inputs.map((source) => ({ id: nextRowId(), source })));

  function commit(nextRows: SelectorRow[]) {
    setRows(nextRows);
    onInputsChange(nextRows.map((row) => row.source));
  }

  return (
    <>
      <ValueSourceField
        label="Índice"
        placeholder="Introduza o índice (começa em 0)"
        inputType="number"
        source={index}
        onChange={onIndexChange}
        referenceOptions={referenceOptions}
        resolvedInput={resolvedInputs[0] ?? { status: 'missing' }}
      />

      {rows.map((row, position) => {
        const removeRow = () => commit(rows.filter((current) => current.id !== row.id));
        return (
          <div key={row.id} className="counter-entry__input-row">
            <div className="counter-entry__input-field">
              <ValueSourceField
                label={`Entrada ${position}`}
                placeholder="Introduza um valor"
                inputType="text"
                source={row.source}
                onChange={(source) => commit(rows.map((current) => (current.id === row.id ? { ...current, source } : current)))}
                referenceOptions={referenceOptions}
                resolvedInput={resolvedInputs[position + 1] ?? { status: 'missing' }}
                // Clicking a picked reference's pill removes the row (see counter's identical use);
                // the × below is for a row still without a reference or a typed value.
                onRemove={removeRow}
              />
            </div>
            {row.source.type !== 'reference' && (
              <button
                type="button"
                className="operation-entry__reset-button counter-entry__remove-input"
                onClick={removeRow}
                aria-label="Remover entrada"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 6 18 18M6 18 18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="operation-entry__pick-button"
        onClick={() => commit([...rows, { id: nextRowId(), source: literalSource('') }])}
      >
        + Adicionar entrada
      </button>

      <SelectorResult
        resolvedInputs={resolvedInputs}
        // An empty literal is indistinguishable from a "ready" empty value by status alone, and
        // means a field the user hasn't finished setting up — skip testing rather than report on it
        // (same reasoning as counter's hasUnsetInput).
        hasUnsetInput={index.type === 'literal' && index.value.trim() === '' ? true : rows.some((row) => row.source.type === 'literal' && row.source.value === '')}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    </>
  );
}

interface SelectorResultProps {
  /** [index, ...inputs], in that order — see SelectorFields. */
  resolvedInputs: ResolvedInput[];
  hasUnsetInput: boolean;
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

type SelectorRequestState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: string };

/**
 * Runs the operation on the API, same as CounterResult: the frontend only resolves which values
 * the index and inputs currently stand for; the actual selection (and its index validation) is
 * POST /api/v1/dataset/operation/selector. Latch-free for the same reason as CounterResult (see
 * its note). Unlike counter, only the index and the *selected* input need to be ready — an
 * unselected input that's still pending doesn't hold the result up.
 */
function SelectorResult({ resolvedInputs, hasUnsetInput, testSignal, resetSignal, onResultChange }: SelectorResultProps) {
  const [state, setState] = useState<SelectorRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const resolvedKey = resolvedInputs.map((input) => (input.status === 'ready' ? `ready:${input.value}` : input.status)).join('|');

  useEffect(() => {
    if (testSignal === 0) {
      return;
    }

    // Nothing to pick from, or a field still unset: a true no-op that leaves an already-shown
    // result alone (see CounterResult's identical note).
    if (resolvedInputs.length < 2 || hasUnsetInput) {
      return;
    }

    if (resolvedInputs.some((input) => input.status === 'cycle')) {
      setState({ status: 'error', message: 'Referência circular entre operações.' });
      onResultChange(null, true);
      return;
    }

    const [indexInput, ...valueInputs] = resolvedInputs;

    if (indexInput.status === 'missing') {
      setState({ status: 'error', message: 'O índice já não existe.' });
      onResultChange(null, true);
      return;
    }

    if (indexInput.status !== 'ready') {
      // pending (the cycle case was already handled above)
      setState({ status: 'waiting' });
      onResultChange(null);
      return;
    }

    // Which input is selected, as far as the client can tell — only used to decide whether to
    // wait on / reject the selected input specifically; a non-numeric or out-of-range index is
    // left for the API to report.
    const selectedPosition = Number(indexInput.value.trim().replace(',', '.'));
    const selected = Number.isInteger(selectedPosition) ? valueInputs[selectedPosition] : undefined;

    if (selected?.status === 'missing') {
      setState({ status: 'error', message: 'A entrada selecionada já não existe.' });
      onResultChange(null, true);
      return;
    }

    if (selected?.status === 'pending') {
      setState({ status: 'waiting' });
      onResultChange(null);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    selectValue({
      index: indexInput.value,
      values: valueInputs.map((input) => (input.status === 'ready' ? input.value : '')),
    })
      .then((response) => {
        if (!cancelled) {
          setState({ status: 'done', value: response.value });
          onResultChange(response.value);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', message: inlineErrorMessage(error, 'Falha ao selecionar a entrada.') });
          onResultChange(null, true);
        }
      });

    // Deliberately doesn't null the result on cleanup — see CounterResult's identical note.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, hasUnsetInput]);

  if (state.status === 'idle' || state.status === 'waiting') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A selecionar…</p>;
  }

  if (state.status === 'error') {
    // Empty for an API failure — its toast already says so (see inlineErrorMessage).
    if (!state.message) return null;
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Valor:</span> {state.value || '(vazio)'}
    </p>
  );
}
