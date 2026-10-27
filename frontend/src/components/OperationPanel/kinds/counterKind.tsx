import { CloseIcon } from '../../ButtonIcons/ButtonIcons';
import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { counterValues } from '../../../services/datasetApi';
import { referenceFromKey, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField, ValueSourcePickerModal } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface CounterFields {
  // However many other operations' results to add together — always references (see
  // ValueSourceField's referenceOnly), never a typed value; each ValueSource is still the same
  // shape as any other kind's single chainable input, just several of them here.
  inputs: ValueSource[];
}

function asCounterFields(fields: OperationFields): CounterFields {
  return fields as unknown as CounterFields;
}

/**
 * Unlike lookup/sum, a counter has no table/column/range to set up at all — it just adds up
 * whatever its inputs resolve to — so there's nothing to configure before confirming (see
 * renderDraftConfig below); the inputs themselves, like every other kind's chainable value, are
 * only edited on the confirmed card (renderBody). Unlike every other kind's chainable field, a
 * counter's inputs are reference-only (see CounterInputs) — it exists to add up *other
 * operations'* results, not values typed in by hand, so it starts with none at all rather than
 * one empty typed one.
 */
export const counterKind: OperationKind = {
  id: 'counter',

  createFields: (): OperationFields => ({
    inputs: [],
  } satisfies CounterFields),

  // Nothing structural to require before confirming — inputs are only ever added afterward, on
  // the confirmed card (renderBody), same as every other kind's chainable value.
  canConfirm: () => true,

  renderDraftConfig: () => null,

  renderSummary: (fields) => {
    const count = asCounterFields(fields).inputs.length;
    return <span>{count} {count === 1 ? 'entrada' : 'entradas'}</span>;
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, referenceOptions, resolvedInputs, onResultChange }) => {
    const f = asCounterFields(fields);
    return (
      <CounterInputs
        inputs={f.inputs}
        onChange={(inputs) => updateFields({ inputs })}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    );
  },

  getColumnHighlights: () => [],

  // A counter isn't tied to any table/column/range — nothing on the sheet to tint either while
  // building it or while hovering its confirmed card.
};

interface CounterRow {
  id: string;
  source: ValueSource;
}

let rowIdSeq = 0;
function nextRowId(): string {
  rowIdSeq += 1;
  return `counter-row-${rowIdSeq}`;
}

interface CounterInputsProps {
  inputs: ValueSource[];
  onChange: (inputs: ValueSource[]) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

/**
 * The editable list of a counter's inputs, plus its live total (see CounterResult below). Each
 * row gets its own stable id (independent of its position in `inputs`) purely so removing a row
 * from the middle doesn't shift a later row into an earlier one's array index — ValueSourceField
 * keeps its own static/dynamic toggle state locally, initialized once from its starting source
 * (see fields.tsx), so reusing a position-based key would make it keep showing the removed row's
 * toggle state instead of the row that actually moved into that slot.
 */
function CounterInputs({ inputs, onChange, referenceOptions, resolvedInputs, testSignal, resetSignal, onResultChange }: CounterInputsProps) {
  const [rows, setRows] = useState<CounterRow[]>(() => inputs.map((source) => ({ id: nextRowId(), source })));

  // "+ Adicionar entrada" opens the reference picker first; rows are only created once something
  // is picked there, so there's never an empty row left to click on afterwards.
  const [isAddOpen, setIsAddOpen] = useState(false);

  function commit(nextRows: CounterRow[]) {
    setRows(nextRows);
    onChange(nextRows.map((row) => row.source));
  }

  function addReferences(operationIds: string[]) {
    commit([
      ...rows,
      ...operationIds.map((operationId) => ({ id: nextRowId(), source: referenceFromKey(operationId) })),
    ]);
    setIsAddOpen(false);
  }

  // Nothing to point a new input at yet (this counter is the only operation so far, or every
  // other one already depends on it) — offering "+ Adicionar entrada" would just open a field
  // with no reference to actually pick, so it's disabled with an explanatory warning instead.
  const canAddInput = referenceOptions.length > 0;

  return (
    <>
      {rows.map((row, index) => {
        const removeRow = () => commit(rows.filter((current) => current.id !== row.id));
        return (
          <div key={row.id} className="counter-entry__input-row">
            <div className="counter-entry__input-field">
              <ValueSourceField
                label={`Entrada ${index + 1}`}
                placeholder="Introduza um valor"
                inputType="number"
                source={row.source}
                onChange={(source) => commit(rows.map((current) => (current.id === row.id ? { ...current, source } : current)))}
                referenceOptions={referenceOptions}
                resolvedInput={resolvedInputs[index] ?? { status: 'missing' }}
                referenceOnly
                // Once a reference is picked, clicking its pill removes the row outright (see
                // onRemove in fields.tsx) — so the standalone × below is only needed to cancel a
                // row that hasn't had a reference picked yet (still showing the reference list,
                // nothing to click on to remove it otherwise).
                onRemove={removeRow}
                // Several references picked at once: the first fills this row, each other gets a
                // new row of its own right after it.
                onPickMany={(operationIds) =>
                  commit(
                    rows.flatMap((current) =>
                      current.id !== row.id
                        ? [current]
                        : operationIds.map((operationId, pickIndex) => ({
                            id: pickIndex === 0 ? current.id : nextRowId(),
                            source: referenceFromKey(operationId),
                          })),
                    ),
                  )
                }
              />
            </div>
            {row.source.type !== 'reference' && (
              <button
                type="button"
                className="operation-entry__reset-button counter-entry__remove-input"
                onClick={removeRow}
                aria-label="Remover entrada"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        );
      })}

      {rows.length === 0 && !canAddInput && (
        <p className="operation-entry__chain-status">
          Não há nenhuma outra operação para somar ainda. Conclua outra operação para a poder adicionar aqui.
        </p>
      )}

      <button
        type="button"
        className="operation-entry__pick-button"
        onClick={() => setIsAddOpen(true)}
        disabled={!canAddInput}
        title={canAddInput ? undefined : 'Não há nenhuma outra operação para referenciar ainda.'}
      >
        + Adicionar entrada
      </button>

      {isAddOpen && (
        <ValueSourcePickerModal
          label="Adicionar entrada"
          placeholder=""
          inputType="number"
          referenceOnly
          referenceOptions={referenceOptions}
          hasColumnPicker={false}
          onStartColumnPick={() => {}}
          initialTab="dynamic"
          onPickStatic={() => {}}
          onPickReference={(operationId) => addReferences([operationId])}
          multiple
          onPickMany={addReferences}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      <CounterResult
        resolvedInputs={resolvedInputs}
        // A row whose picker is still open (dynamic chosen, nothing picked yet) is still a
        // literal — an empty one — internally (see the "+ Adicionar entrada" handler above),
        // indistinguishable from a "ready" input by status alone. Testing while one of these is
        // still open would either sum garbage or show a confusing error about an entry the user
        // hasn't finished setting up yet, so it's passed through separately to skip testing
        // entirely instead (see CounterResult).
        hasUnsetInput={rows.some((row) => row.source.type === 'literal')}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    </>
  );
}

interface CounterResultProps {
  resolvedInputs: ResolvedInput[];
  /** True while any row still has its reference picker open with nothing chosen yet — see the
   * comment where this is computed, in CounterInputs. */
  hasUnsetInput: boolean;
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

type CounterRequestState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; total: number };

/**
 * Runs the operation on the API, same as SumResult/LookupResult: the frontend only resolves
 * *which* values the counter's inputs currently stand for (see resolveOperationInputs) — the
 * actual addition happens server-side, via POST /api/v1/dataset/operation/counter, given just
 * those already-resolved values (no dataset/table/column/range, unlike lookup/sum, since a
 * counter isn't tied to any of those).
 */
function CounterResult({ resolvedInputs, hasUnsetInput, testSignal, resetSignal, onResultChange }: CounterResultProps) {
  const [state, setState] = useState<CounterRequestState>({ status: 'idle' });

  // "Limpar teste": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // A stable, primitive summary of every input's status/value — resolvedInputs is a freshly
  // built array on every render (see resolveOperationInputs), so depending on it directly would
  // re-run this effect on every unrelated render instead of only when something it actually
  // reads changed.
  const resolvedKey = resolvedInputs.map((input) => (input.status === 'ready' ? `ready:${input.value}` : input.status)).join('|');

  useEffect(() => {
    if (testSignal === 0) {
      return;
    }

    // No inputs at all, or one still has its picker open with nothing chosen yet — nothing to
    // test yet (the "+ Adicionar entrada" warning, or the row's own "no reference picked"
    // status, already explains why, right there on the card), so this is a true no-op: don't
    // touch state, don't call the API, don't report a result. In particular, this must not clear
    // a total already shown from an earlier test — adding a new row (which starts unset until
    // picked) shouldn't blank out the still-valid total the other, already fully-configured rows
    // produced; finishing that row and clicking "Testar modelo" again is what refreshes it.
    if (resolvedInputs.length === 0 || hasUnsetInput) {
      return;
    }

    if (resolvedInputs.some((input) => input.status === 'cycle')) {
      setState({ status: 'error', message: 'Referência circular entre operações.' });
      onResultChange(null, true);
      return;
    }

    if (resolvedInputs.some((input) => input.status === 'missing')) {
      setState({ status: 'error', message: 'Uma das entradas já não existe.' });
      onResultChange(null, true);
      return;
    }

    // A referenced operation's own result can go from pending to ready mid test-cycle (once its
    // own upstream fetch resolves) — including briefly going *back* to pending right after a
    // fresh "Testar modelo" click, before that operation's own re-fetch has produced its new
    // value yet. Unlike lookup/sum, a counter has no single "already responded to this click"
    // latch: it simply always calls the API with whatever its inputs currently resolve to once
    // every one of them is ready, however many pending/ready flips it takes to get there. A
    // latch here caused a real bug — a stale "ready" read (this operation's own last-computed
    // value, not yet cleared by its own fresh re-fetch) could get treated as the final answer for
    // this click, permanently blocking the real, fresh call that should have followed moments
    // later.
    if (resolvedInputs.some((input) => input.status === 'pending')) {
      setState({ status: 'waiting' });
      onResultChange(null);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    counterValues({ values: resolvedInputs.map((input) => (input.status === 'ready' ? input.value : '')) })
      .then((response) => {
        if (!cancelled) {
          setState({ status: 'done', total: response.total });
          onResultChange(String(response.total));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', message: inlineErrorMessage(error, 'Falha ao somar as entradas.') });
          onResultChange(null, true);
        }
      });

    // Deliberately doesn't null the result here on cleanup (unlike SumResult/LookupResult's
    // equivalent cleanup) — a cleanup runs before *every* re-invocation of this effect, including
    // the "nothing to do yet" early-return above (e.g. a new row being added mid-configuration),
    // which must leave a previously shown total exactly as it was, not wipe it. `cancelled` alone
    // is enough to stop a stale response from a superseded call landing after a newer one.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, hasUnsetInput]);

  if (state.status === 'idle' || state.status === 'waiting') {
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
      <span className="operation-entry__result-label">Total:</span> {state.total}
    </p>
  );
}
