import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { translateValue } from '../../../services/datasetApi';
import { literalSource, referenceFromKey, type ValueSource } from '../../../types/valueSource';
import type { TranslatorRule } from '../../../types/translator';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface TranslatorFields {
  // The values to translate, each translated on its own with the same rules, giving one output per
  // input — typed directly, or chained from other operations' results. A translator made before
  // there could be several instead has a single `input` (see translatorInputs).
  inputs?: ValueSource[];
  input?: ValueSource;
  // The mapping table itself: each rule's "from" must be unique (see findDuplicateSources) — the
  // whole point of a translator is that a given input value translates to exactly one output —
  // but several rules can share the same "to" (many sources translating to one target is the
  // normal case, e.g. several codes all meaning "1").
  rules: TranslatorRule[];
}

function asTranslatorFields(fields: OperationFields): TranslatorFields {
  return fields as unknown as TranslatorFields;
}

/** The translator's inputs: its `inputs` list, or — for one made with a single `input` — just that. */
function translatorInputs(f: TranslatorFields): ValueSource[] {
  return f.inputs ?? (f.input ? [f.input] : []);
}

/** Every "from" value that's reused by more than one rule (trimmed, case-insensitive — same match
 * semantics the backend itself uses, see DatasetOperationService's own translate). Empty ones
 * aren't reported here — canConfirm already blocks confirming with a blank "from" on its own. */
function findDuplicateSources(rules: TranslatorRule[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const rule of rules) {
    const key = rule.from.trim().toLowerCase();
    if (key === '') continue;
    if (seen.has(key)) {
      duplicates.add(rule.from.trim());
    }
    seen.add(key);
  }
  return duplicates;
}

function replaceRuleAt(rules: TranslatorRule[], index: number, rule: TranslatorRule): TranslatorRule[] {
  return rules.map((current, currentIndex) => (currentIndex === index ? rule : current));
}

export const translatorKind: OperationKind = {
  id: 'translator',

  createFields: (): OperationFields => ({
    inputs: [literalSource('')],
    rules: [],
  } satisfies TranslatorFields),

  canConfirm: (fields) => {
    const f = asTranslatorFields(fields);
    if (f.rules.length === 0) return false;
    if (f.rules.some((rule) => rule.from.trim() === '' || rule.to.trim() === '')) return false;
    return findDuplicateSources(f.rules).size === 0;
  },

  // Unlike lookup/sum, a translator has no table/column/range to pick — its whole configuration
  // is the mapping table itself, edited here the same way lookup picks its table/columns: once,
  // at draft time, not on the confirmed card (which only shows the chainable "input" — see
  // renderBody — collapsed by default like every other kind's).
  renderDraftConfig: ({ fields, updateFields }) => {
    const f = asTranslatorFields(fields);
    const duplicates = findDuplicateSources(f.rules);

    return (
      <div className="operation-entry__field">
        <label className="operation-entry__label">Regras</label>

        {f.rules.map((rule, index) => (
          <div key={index} className="translator-entry__rule-row">
            <input
              type="text"
              className="operation-entry__input translator-entry__rule-input"
              placeholder="Valor de origem"
              value={rule.from}
              onChange={(event) => updateFields({ rules: replaceRuleAt(f.rules, index, { ...rule, from: event.target.value }) })}
            />
            <span className="translator-entry__rule-arrow">→</span>
            <input
              type="text"
              className="operation-entry__input translator-entry__rule-input"
              placeholder="Valor de destino"
              value={rule.to}
              onChange={(event) => updateFields({ rules: replaceRuleAt(f.rules, index, { ...rule, to: event.target.value }) })}
            />
            <button
              type="button"
              className="operation-entry__reset-button"
              onClick={() => updateFields({ rules: f.rules.filter((_, currentIndex) => currentIndex !== index) })}
              aria-label="Remover regra"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 6 18 18M6 18 18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))}

        {duplicates.size > 0 && (
          <p className="operation-entry__chain-status">
            Duas regras não podem ter o mesmo valor de origem: {[...duplicates].join(', ')}
          </p>
        )}

        <button
          type="button"
          className="operation-entry__pick-button"
          onClick={() => updateFields({ rules: [...f.rules, { from: '', to: '' }] })}
        >
          + Adicionar regra
        </button>
      </div>
    );
  },

  renderSummary: (fields) => {
    const f = asTranslatorFields(fields);
    const rules = f.rules.length;
    const inputs = translatorInputs(f).length;
    return (
      <span>
        {rules} {rules === 1 ? 'regra' : 'regras'} · {inputs} {inputs === 1 ? 'entrada' : 'entradas'}
      </span>
    );
  },

  // Only a translator with a single `input` can be a model's designated input (see
  // hasSingleInputField); one with an `inputs` list is fed through other operations instead.
  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asTranslatorFields(fields);
    return (
      <ValueSourceField
        label="Valor a traduzir"
        placeholder="Introduza um valor"
        inputType="text"
        source={f.input ?? literalSource('')}
        onChange={(input) => updateFields({ input })}
        referenceOptions={[]}
        resolvedInput={resolvedInput}
      />
    );
  },

  getOutputLabels: (fields, labelOf) => {
    const inputs = translatorInputs(asTranslatorFields(fields));
    if (inputs.length < 2) return null;
    return inputs.map((source, index) =>
      source.type === 'reference' ? labelOf(source.operationId) : source.value.trim() || `Saída ${index + 1}`,
    );
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, resolvedInputs, referenceOptions, onResultChange, onOutputsChange }) => {
    const f = asTranslatorFields(fields);
    return (
      <TranslatorInputs
        inputs={translatorInputs(f)}
        // Editing moves a translator made with a single `input` over to the `inputs` list.
        onChange={(inputs) => updateFields({ inputs, input: undefined })}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        rules={f.rules}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
        onOutputsChange={onOutputsChange}
      />
    );
  },

  getColumnHighlights: () => [],

  // A translator isn't tied to any table/column/range — nothing on the sheet to tint either while
  // building it or while hovering its confirmed card.
};

interface TranslatorRow {
  id: string;
  source: ValueSource;
}

let rowIdSeq = 0;
function nextRowId(): string {
  rowIdSeq += 1;
  return `translator-row-${rowIdSeq}`;
}

type OutputState = { status: 'value'; value: string } | { status: 'error'; message: string };

interface TranslatorInputsProps {
  inputs: ValueSource[];
  onChange: (inputs: ValueSource[]) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
  rules: TranslatorRule[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
  onOutputsChange: (values: (string | null)[]) => void;
}

type TranslatorRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; outputs: OutputState[] };

/**
 * The editable list of inputs (each row keeps a stable id, like counter's rows, so removing one
 * from the middle doesn't hand its field state to the next), plus the live outputs: one translated
 * value per input, each via /api/v1/dataset/operation/translator (which does the actual
 * source→target lookup and its own "no rule for this value" validation) — only once "Testar
 * modelo" is clicked. Outputs are reported by position (onOutputsChange) so other operations can
 * reference each one; with a single input the lone output is also the operation's plain result.
 */
function TranslatorInputs({
  inputs,
  onChange,
  referenceOptions,
  resolvedInputs,
  rules,
  testSignal,
  resetSignal,
  onResultChange,
  onOutputsChange,
}: TranslatorInputsProps) {
  const [rows, setRows] = useState<TranslatorRow[]>(() => inputs.map((source) => ({ id: nextRowId(), source })));
  const [state, setState] = useState<TranslatorRequestState>({ status: 'idle' });

  function commit(nextRows: TranslatorRow[]) {
    setRows(nextRows);
    onChange(nextRows.map((row) => row.source));
  }

  const resolvedKey = resolvedInputs.map((input) => (input.status === 'ready' ? `ready:${input.value}` : input.status)).join('|');
  const rulesKey = JSON.stringify(rules);

  // "Limpar teste": clears the shown outputs on demand, independent of any field changing.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    onOutputsChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Which testSignal we've already gotten the outputs for — an edit afterwards (same signal) clears
  // the shown outputs instead of calling the API again; only another test does.
  const [handledSignal, setHandledSignal] = useState(0);
  useEffect(() => {
    setHandledSignal(0);
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0 || resolvedInputs.length === 0) {
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

    // A chained input that hasn't produced its result yet: wait for it, keeping nothing stale.
    if (resolvedInputs.some((input) => input.status === 'pending')) {
      setState({ status: 'idle' });
      onResultChange(null);
      onOutputsChange([]);
      return;
    }

    const values = resolvedInputs.map((input) => (input.status === 'ready' ? input.value : ''));
    // An empty value has nothing to translate yet — a true no-op, leaving whatever is shown.
    if (values.some((value) => value.trim() === '')) {
      return;
    }

    if (testSignal === handledSignal) {
      setState({ status: 'idle' });
      onResultChange(null);
      onOutputsChange([]);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    Promise.allSettled(values.map((input) => translateValue({ input, rules }))).then((settled) => {
      if (cancelled) return;
      const outputs: OutputState[] = settled.map((outcome) =>
        outcome.status === 'fulfilled'
          ? { status: 'value', value: outcome.value.value }
          : { status: 'error', message: inlineErrorMessage(outcome.reason, 'Falha ao traduzir o valor.') },
      );
      const failed = outputs.some((output) => output.status === 'error');
      const translated = outputs.map((output) => (output.status === 'value' ? output.value : null));
      setHandledSignal(testSignal);
      setState({ status: 'done', outputs });
      onOutputsChange(translated);
      onResultChange(translated.length === 1 ? translated[0] : null, failed);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, rulesKey]);

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
                inputType="text"
                source={row.source}
                onChange={(source) => commit(rows.map((current) => (current.id === row.id ? { ...current, source } : current)))}
                referenceOptions={referenceOptions}
                resolvedInput={resolvedInputs[index] ?? { status: 'missing' }}
                onRemove={removeRow}
                // Several references picked at once: the first fills this row, each other gets a
                // new row of its own right after it.
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

      {state.status === 'loading' && <p className="operation-entry__result operation-entry__result--empty">A traduzir…</p>}

      {state.status === 'error' && state.message && (
        <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>
      )}

      {state.status === 'done' &&
        state.outputs.map((output, index) =>
          output.status === 'value' ? (
            <p key={rows[index]?.id ?? index} className="operation-entry__result">
              <span className="operation-entry__result-label">{rows.length === 1 ? 'Saída' : `Saída ${index + 1}`}:</span>{' '}
              {output.value || '(vazio)'}
            </p>
          ) : output.message ? (
            <p key={rows[index]?.id ?? index} className="operation-entry__result operation-entry__result--empty">
              Saída {index + 1}: {output.message}
            </p>
          ) : null,
        )}
    </>
  );
}
