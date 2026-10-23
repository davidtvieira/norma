import { useEffect } from 'react';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface PageFields {
  // The index of the page (sheet) to select, counted from 0 — typed directly, chained from another
  // operation's result, or filled in by whoever utilizes the model (it can be a model input).
  input: ValueSource;
}

function asPageFields(fields: OperationFields): PageFields {
  return fields as unknown as PageFields;
}

/** The page index a resolved input stands for, if it is a whole number inside the dataset. */
function pageIndexOf(resolved: ResolvedInput, pageCount: number): number | null {
  if (resolved.status !== 'ready') return null;
  const text = resolved.value.trim();
  if (!/^\d+$/.test(text)) return null;
  const index = Number(text);
  return index < pageCount ? index : null;
}

/**
 * Chooses one page (sheet) of the dataset from an index. Its own result is that index; lookup, sum
 * and find can be pointed at a page selector ("Página do seletor") to read from the page it picks
 * instead of their own fixed table, so one model can run against a different page depending on a
 * value — typed, chained from another operation, or supplied by whoever utilizes the model.
 */
export const pageKind: OperationKind = {
  id: 'page',

  createFields: (): OperationFields => ({
    input: literalSource(''),
  } satisfies PageFields),

  canConfirm: () => true,

  renderDraftConfig: () => null,

  renderSummary: (_fields, dataset) => {
    const count = dataset.sheets.length;
    return <span>{count} {count === 1 ? 'página' : 'páginas'}</span>;
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asPageFields(fields);
    return (
      <ValueSourceField
        label="Índice da página"
        placeholder="Introduza o índice da página"
        inputType="number"
        source={f.input}
        onChange={(input) => updateFields({ input })}
        referenceOptions={[]}
        resolvedInput={resolvedInput}
      />
    );
  },

  renderBody: ({ fields, updateFields, testSignal, resetSignal, resolvedInput, referenceOptions, sheetNames, onResultChange }) => {
    const f = asPageFields(fields);
    return (
      <>
        <ValueSourceField
          label="Índice da página"
          placeholder="Introduza o índice da página"
          inputType="number"
          source={f.input}
          onChange={(input) => updateFields({ input })}
          referenceOptions={referenceOptions}
          resolvedInput={resolvedInput}
        />

        <PageResult
          resolvedInput={resolvedInput}
          sheetNames={sheetNames}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onResultChange={onResultChange}
        />
      </>
    );
  },

  getColumnHighlights: () => [],
};

interface PageResultProps {
  resolvedInput: ResolvedInput;
  sheetNames: string[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

/**
 * Checks the index against the dataset's pages and reports it (no API call needed — the page list
 * is already known). Only once "Testar modelo" has been clicked, and re-checked as a chained index
 * arrives.
 */
function PageResult({ resolvedInput, sheetNames, testSignal, resetSignal, onResultChange }: PageResultProps) {
  const resolvedKey = resolvedInput.status === 'ready' ? `ready:${resolvedInput.value}` : resolvedInput.status;
  const index = pageIndexOf(resolvedInput, sheetNames.length);
  const tested = testSignal > 0;
  const hasValue = resolvedInput.status === 'ready' && resolvedInput.value.trim() !== '';
  const invalid = tested && hasValue && index === null;

  // "Limpar teste": back to not-tested.
  useEffect(() => {
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (!tested) return;
    if (resolvedInput.status === 'cycle' || resolvedInput.status === 'missing' || invalid) {
      onResultChange(null, true);
    } else if (index !== null) {
      onResultChange(String(index));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey, sheetNames.length]);

  if (!tested) return null;

  if (invalid) {
    return (
      <p className="operation-entry__result operation-entry__result--empty">
        Índice inválido: o conjunto de dados tem {sheetNames.length} {sheetNames.length === 1 ? 'página' : 'páginas'} (0 a{' '}
        {sheetNames.length - 1}).
      </p>
    );
  }

  if (index === null) return null;

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Página:</span> {index} · {sheetNames[index]}
    </p>
  );
}
