import { useEffect, useRef, useState } from 'react';
import { translateValue } from '../../../services/datasetApi';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { TranslatorRule } from '../../../types/translator';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface TranslatorFields {
  // The value to translate — typed directly, or chained from another operation's result, same as
  // lookup's own chainable query.
  input: ValueSource;
  // The mapping table itself: each rule's "from" must be unique (see findDuplicateSources) — the
  // whole point of a translator is that a given input value translates to exactly one output —
  // but several rules can share the same "to" (many sources translating to one target is the
  // normal case, e.g. several codes all meaning "1").
  rules: TranslatorRule[];
}

function asTranslatorFields(fields: OperationFields): TranslatorFields {
  return fields as unknown as TranslatorFields;
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
    input: literalSource(''),
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
    const count = asTranslatorFields(fields).rules.length;
    return <span>{count} {count === 1 ? 'regra' : 'regras'}</span>;
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asTranslatorFields(fields);
    return (
      <ValueSourceField
        label="Valor a traduzir"
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
    const f = asTranslatorFields(fields);
    return (
      <>
        <ValueSourceField
          label="Valor a traduzir"
          placeholder="Introduza um valor"
          inputType="text"
          source={f.input}
          onChange={(input) => updateFields({ input })}
          referenceOptions={referenceOptions}
          resolvedInput={resolvedInput}
        />

        <TranslatorResult
          resolvedInput={resolvedInput}
          rules={f.rules}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onResultChange={onResultChange}
        />
      </>
    );
  },

  getColumnHighlights: () => [],

  // A translator isn't tied to any table/column/range — nothing on the sheet to tint either while
  // building it or while hovering its confirmed card.
};

interface TranslatorResultProps {
  resolvedInput: ResolvedInput;
  rules: TranslatorRule[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null) => void;
}

type TranslatorRequestState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: string };

/**
 * Runs the operation entirely on the API: the (resolved) input and the rule table are sent to
 * /api/v1/dataset/operation/translator, which does the actual source→target lookup (and its own
 * "no two rules share a source" / "no rule for this value" validation) — this component only
 * renders the outcome, and only once "Testar modelo" is actually clicked. Mirrors NodeResult's own
 * request lifecycle (including its "waiting" state for a still-resolving chained input) plus
 * LookupResult/FindResult's in-flight-promise reuse, since — like those two, and unlike node's own
 * pass-through — this makes a real backend call that a React StrictMode double-mount shouldn't
 * duplicate.
 */
function TranslatorResult({ resolvedInput, rules, testSignal, resetSignal, onResultChange }: TranslatorResultProps) {
  const [state, setState] = useState<TranslatorRequestState>({ status: 'idle' });

  const resolvedKey = resolvedInput.status === 'ready' ? `ready:${resolvedInput.value}` : resolvedInput.status;

  // Which testSignal we've already gotten a definitive response for — see LookupResult's own
  // identical note; a dynamic (chained) input catching up mid test-cycle must still fire once it
  // resolves, not be treated as a stale edit.
  const handledForSignalRef = useRef(0);
  const inFlightRef = useRef<{ signal: number; promise: ReturnType<typeof translateValue> } | null>(null);

  // "Limpar teste": clears the shown result on demand, independent of any field changing. Also
  // resets handledForSignalRef/inFlightRef — see LookupResult's equivalent note on why: "Limpar
  // teste" resets every entry's own testSignal counter back to 0, so without this the *next*
  // test's testSignal could numerically collide with a value already recorded here, making the
  // dedup check above mistake a genuinely new test for an already-handled one and skip the fetch.
  useEffect(() => {
    setState({ status: 'idle' });
    onResultChange(null);
    handledForSignalRef.current = 0;
    inFlightRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

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

    if (resolvedInput.value.trim() === '') {
      return;
    }

    if (testSignal === handledForSignalRef.current) {
      setState({ status: 'idle' });
      onResultChange(null);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const request =
      inFlightRef.current && inFlightRef.current.signal === testSignal
        ? inFlightRef.current.promise
        : (() => {
            const promise = translateValue({ input: resolvedInput.value, rules });
            inFlightRef.current = { signal: testSignal, promise };
            return promise;
          })();

    request
      .then((response) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'done', value: response.value });
          onResultChange(response.value);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao traduzir o valor.' });
          onResultChange(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, rules]);

  if (state.status === 'idle') {
    return null;
  }

  // Chained off another operation that hasn't produced a result yet — nothing to show, same as
  // 'idle' (no test run at all), rather than a placeholder message.
  if (state.status === 'waiting') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A traduzir…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Saída:</span> {state.value || '(vazio)'}
    </p>
  );
}
