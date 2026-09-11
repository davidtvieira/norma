import { useEffect, useState } from 'react';
import { nodeValue } from '../../../services/datasetApi';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface NodeFields {
  // The single value this node stands for — typed directly, or chained from another operation's
  // result, same as lookup's own chainable "input". A node isn't really an operation on the
  // dataset at all; it exists purely so this value can be referenced as another operation's
  // chainable input (or filled in by whoever utilizes the model, if marked as a model input —
  // see OperationPanel's "Input" toggle, eligible here the same way it already is for lookup).
  input: ValueSource;
}

function asNodeFields(fields: OperationFields): NodeFields {
  return fields as unknown as NodeFields;
}

/**
 * Not really an "operation" — a node has no table/column/range, and does nothing to its value
 * beyond holding it: its whole purpose is to be a place a value can live (typed directly, or
 * filled in by a model's caller) so other operations can chain off it, the same way they'd chain
 * off any other operation's result. There's nothing to configure before confirming (see
 * renderDraftConfig below); the value itself is edited on the confirmed card, same as lookup's
 * query.
 */
export const nodeKind: OperationKind = {
  id: 'node',

  createFields: (): OperationFields => ({
    input: literalSource(''),
  } satisfies NodeFields),

  canConfirm: () => true,

  renderDraftConfig: () => null,

  renderSummary: (fields) => {
    const f = asNodeFields(fields);
    return <span>{f.input.type === 'reference' ? 'Valor encadeado' : 'Valor simples'}</span>;
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asNodeFields(fields);
    return (
      <ValueSourceField
        label="Valor"
        placeholder="Introduza um valor"
        inputType="text"
        source={f.input}
        onChange={(input) => updateFields({ input })}
        referenceOptions={[]}
        resolvedInput={resolvedInput}
      />
    );
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, resolvedInput, referenceOptions, onResultChange }) => {
    const f = asNodeFields(fields);
    return (
      <>
        <ValueSourceField
          label="Valor"
          placeholder="Introduza um valor"
          inputType="text"
          source={f.input}
          onChange={(input) => updateFields({ input })}
          referenceOptions={referenceOptions}
          resolvedInput={resolvedInput}
        />

        <NodeResult resolvedInput={resolvedInput} testSignal={testSignal} resetSignal={resetSignal} onResultChange={onResultChange} />
      </>
    );
  },

  getColumnHighlights: () => [],

  // A node isn't tied to any table/column/range — nothing on the sheet to tint either while
  // building it or while hovering its confirmed card.
};

interface NodeResultProps {
  resolvedInput: ResolvedInput;
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null) => void;
}

type NodeRequestState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: string };

/**
 * Runs the operation on the API, same as SumResult/LookupResult/CounterResult: POST
 * /api/v1/dataset/operation/node just echoes back the value it's given — there's no computation
 * on the backend's side either, this only exists so a node's result-reporting (and therefore
 * chaining) goes through the same testSignal-gated flow every other kind's does. Deliberately
 * latch-free (no "already responded to this click" state) — see CounterResult's own note on why
 * that caused a real bug when an input can itself be chained off another operation.
 */
function NodeResult({ resolvedInput, testSignal, resetSignal, onResultChange }: NodeResultProps) {
  const [state, setState] = useState<NodeRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const resolvedKey = resolvedInput.status === 'ready' ? `ready:${resolvedInput.value}` : resolvedInput.status;

  useEffect(() => {
    if (testSignal === 0) {
      return;
    }

    if (resolvedInput.status === 'cycle') {
      setState({ status: 'error', message: 'Referência circular entre operações.' });
      onResultChange(null);
      return;
    }

    if (resolvedInput.status === 'missing') {
      setState({ status: 'error', message: 'Essa operação já não existe.' });
      onResultChange(null);
      return;
    }

    if (resolvedInput.status === 'pending') {
      setState({ status: 'waiting' });
      onResultChange(null);
      return;
    }

    // An empty value has nothing to test yet — same as lookup's own empty-query no-op — so this
    // must not clear an already-shown value; a true no-op, like counter's own for an unset row.
    if (resolvedInput.value.trim() === '') {
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    nodeValue({ value: resolvedInput.value })
      .then((response) => {
        if (!cancelled) {
          setState({ status: 'done', value: response.value });
          onResultChange(response.value);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao processar o valor.' });
          onResultChange(null);
        }
      });

    // Deliberately doesn't null the result on cleanup (see CounterResult's identical note) — a
    // cleanup runs before every re-invocation of this effect, including the empty-value no-op
    // above, which must leave an already-shown value exactly as it was.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey]);

  if (state.status === 'idle') {
    return null;
  }

  // Chained off another operation that hasn't produced a result yet — nothing to show, same as
  // 'idle' (no test run at all), rather than a placeholder message.
  if (state.status === 'waiting') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A processar…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Valor:</span> {state.value || '(vazio)'}
    </p>
  );
}
