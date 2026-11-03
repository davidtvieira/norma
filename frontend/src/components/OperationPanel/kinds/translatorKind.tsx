import { CloseIcon } from '../../ButtonIcons/ButtonIcons';
import { inlineErrorMessage } from '../../../services/apiErrors';
import { useEffect, useState } from 'react';
import { translateValue } from '../../../services/datasetApi';
import { literalSource, referenceFromKey, type ValueSource } from '../../../types/valueSource';
import type { TranslatorRule, TranslatorType } from '../../../types/translator';
import { rangeProblems } from '../../../utils/translatorRanges';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface TranslatorFields {
  // How the rules read: "fixed" (each maps one exact source value) or "range" (each maps a numeric interval, min..max
  // inclusive, either left empty for no limit). A translator made before the type existed has none, and is fixed.
  type?: TranslatorType;
  // The values to translate, each translated on its own with the same rules, giving one output per
  // input — typed directly, or chained from other operations' results.
  inputs?: ValueSource[];
  // The mapping table itself: each rule's "from" must be unique (see findDuplicateSources) — the
  // whole point of a translator is that a given input value translates to exactly one output —
  // but several rules can share the same "to" (many sources translating to one target is the
  // normal case, e.g. several codes all meaning "1").
  rules: TranslatorRule[];
}

function asTranslatorFields(fields: OperationFields): TranslatorFields {
  return fields as unknown as TranslatorFields;
}

function translatorType(f: TranslatorFields): TranslatorType {
  return f.type === 'range' ? 'range' : 'fixed';
}

/** The translator's inputs: its `inputs` list. */
function translatorInputs(f: TranslatorFields): ValueSource[] {
  return f.inputs ?? [];
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
  requiresDataset: false,

  createFields: (): OperationFields => ({
    type: 'fixed',
    inputs: [literalSource('')],
    rules: [],
  } satisfies TranslatorFields),

  canConfirm: (fields) => {
    const f = asTranslatorFields(fields);
    if (f.rules.length === 0) return false;
    if (translatorType(f) === 'range') {
      return f.rules.every((rule) => rule.to.trim() !== '') && rangeProblems(f.rules).length === 0;
    }
    if (f.rules.some((rule) => rule.from.trim() === '' || rule.to.trim() === '')) return false;
    return findDuplicateSources(f.rules).size === 0;
  },

  // Unlike lookup/find, a translator has no table/column/range to pick — its whole configuration
  // is the mapping table itself, edited here the same way lookup picks its table/columns: once,
  // at draft time, not on the confirmed card (which only shows the chainable "input" — see
  // renderBody — collapsed by default like every other kind's).
  renderDraftConfig: ({ fields, updateFields }) => {
    const f = asTranslatorFields(fields);
    const type = translatorType(f);
    const duplicates = findDuplicateSources(f.rules);
    const problems = type === 'range' ? rangeProblems(f.rules) : [];

    // Switching type starts the rules over: a fixed rule and an interval don't mean the same thing.
    const chooseType = (next: TranslatorType) => {
      if (next !== type) updateFields({ type: next, rules: [] });
    };

    return (
      <>
      <div className="operation-entry__field">
        <label className="operation-entry__label">Tipo de tradutor</label>
        <div className="operation-entry__source-toggle">
          <button
            type="button"
            className={`operation-entry__source-toggle-button${type === 'fixed' ? ' operation-entry__source-toggle-button--active' : ''}`}
            aria-pressed={type === 'fixed'}
            onClick={() => chooseType('fixed')}
          >
            Fixo
          </button>
          <button
            type="button"
            className={`operation-entry__source-toggle-button${type === 'range' ? ' operation-entry__source-toggle-button--active' : ''}`}
            aria-pressed={type === 'range'}
            onClick={() => chooseType('range')}
          >
            Intervalo
          </button>
        </div>
        <p className="operation-entry__chain-status">
          {type === 'fixed'
            ? 'Cada regra troca um valor exato por outro.'
            : 'Cada regra troca os números de um intervalo por um valor. Os limites contam; deixe um vazio para "sem limite".'}
        </p>
      </div>

      <div className="operation-entry__field">
        <label className="operation-entry__label">{type === 'fixed' ? 'Regras' : 'Intervalos'}</label>

        {f.rules.map((rule, index) => type === 'range' ? (
          <div key={index} className="translator-entry__rule-row">
            <input
              type="text"
              inputMode="decimal"
              className="operation-entry__input translator-entry__rule-input"
              placeholder="De (opcional)"
              aria-label="Limite inferior"
              value={rule.min ?? ''}
              onChange={(event) => updateFields({ rules: replaceRuleAt(f.rules, index, { ...rule, min: event.target.value }) })}
            />
            <span className="translator-entry__rule-arrow">a</span>
            <input
              type="text"
              inputMode="decimal"
              className="operation-entry__input translator-entry__rule-input"
              placeholder="Até (opcional)"
              aria-label="Limite superior"
              value={rule.max ?? ''}
              onChange={(event) => updateFields({ rules: replaceRuleAt(f.rules, index, { ...rule, max: event.target.value }) })}
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
              aria-label="Remover intervalo"
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
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
              <CloseIcon />
            </button>
          </div>
        ))}

        {duplicates.size > 0 && (
          <p className="operation-entry__chain-status">
            Duas regras não podem ter o mesmo valor de origem: {[...duplicates].join(', ')}
          </p>
        )}

        {problems.map((problem) => (
          <p key={problem} className="operation-entry__chain-status">
            {problem}
          </p>
        ))}

        <button
          type="button"
          className="btn btn--secondary btn--sm btn--block"
          onClick={() => updateFields({ rules: [...f.rules, type === 'range' ? { from: '', to: '', min: '', max: '' } : { from: '', to: '' }] })}
        >
          {type === 'range' ? '+ Adicionar intervalo' : '+ Adicionar regra'}
        </button>
      </div>
      </>
    );
  },

  renderSummary: (fields) => {
    const f = asTranslatorFields(fields);
    const rules = f.rules.length;
    const inputs = translatorInputs(f).length;
    const isRange = translatorType(f) === 'range';
    const ruleWord = isRange ? (rules === 1 ? 'intervalo' : 'intervalos') : rules === 1 ? 'regra' : 'regras';
    return (
      <span>
        {rules} {ruleWord} · {inputs} {inputs === 1 ? 'entrada' : 'entradas'}
      </span>
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
        onChange={(inputs) => updateFields({ inputs })}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        rules={f.rules}
        type={translatorType(f)}
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
  type: TranslatorType;
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
 * The editable list of inputs (each row keeps a stable id, like a calc's rows, so removing one
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
  type,
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
  const rulesKey = JSON.stringify([type, rules]);

  // "Limpar dados": clears the shown outputs on demand, independent of any field changing.
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

    Promise.allSettled(values.map((input) => translateValue({ input, type, rules }))).then((settled) => {
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
          <div key={row.id} className="list-entry__input-row">
            <div className="list-entry__input-field">
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
        className="btn btn--secondary btn--sm btn--block"
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
