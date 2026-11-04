import { useEffect, useState } from 'react';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ValueSourceField } from '../fields';
import type { OperationFields, OperationKind, ReferenceOption } from '../operationKind';

interface CombinedFields {
  // Declared in this order on purpose: getInputSources (and therefore resolvedInputs) reads a kind's chainable fields in
  // object-key order, so resolvedInputs[0] is `first` and resolvedInputs[1] is `second`.
  // The main value of the output (e.g. an evaluation).
  first: ValueSource;
  // Its detail (e.g. the values that were counted). Either can be a list, which the card then offers to open.
  second: ValueSource;
}

function asCombinedFields(fields: OperationFields): CombinedFields {
  return fields as unknown as CombinedFields;
}

/** The kind id of the combined output: always a model output, and never an input of another operation. */
export const COMBINED_KIND_ID = 'combined';

/**
 * Merges two inputs into the one result a caller sees as a single card with two output boxes: a main value and a detail
 * (a list stays a list, which the card opens on click). It computes nothing itself, so there is no endpoint to call: the
 * editor just shows what its two inputs stand for once "Testar modelo" has run.
 */
export const combinedKind: OperationKind = {
  id: COMBINED_KIND_ID,
  requiresDataset: false,

  createFields: (): OperationFields => ({
    first: literalSource(''),
    second: literalSource(''),
  } satisfies CombinedFields),

  canConfirm: () => true,

  renderDraftConfig: () => null,

  renderSummary: () => <span>Valor principal e detalhe</span>,

  renderBody: ({ fields, updateFields, testSignal, resetSignal, referenceOptions, resolvedInputs, onResultChange }) => {
    const f = asCombinedFields(fields);
    return (
      <CombinedEditor
        fields={f}
        updateFields={updateFields}
        referenceOptions={referenceOptions}
        resolvedInputs={resolvedInputs}
        testSignal={testSignal}
        resetSignal={resetSignal}
        onResultChange={onResultChange}
      />
    );
  },

  getColumnHighlights: () => [],

  // A combined output isn't tied to any table/column/range — nothing on the sheet to tint.
};

type Shown = { first: string; second: string };

function isUnsetLiteral(source: ValueSource): boolean {
  return source.type === 'literal' && source.value.trim() === '';
}

/** An input as the text the editor shows: the value, or how many values it holds followed by them. */
function describeInput(input: ResolvedInput): string {
  if (input.status !== 'ready') return '';
  return input.items ? `${input.items.length} saídas: ${input.items.join(', ')}` : input.value || '(vazio)';
}

interface CombinedEditorProps {
  fields: CombinedFields;
  updateFields: (patch: OperationFields) => void;
  referenceOptions: ReferenceOption[];
  resolvedInputs: ResolvedInput[];
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

function CombinedEditor({ fields, updateFields, referenceOptions, resolvedInputs, testSignal, resetSignal, onResultChange }: CombinedEditorProps) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing: ResolvedInput = { status: 'missing' };
  const resolvedKey = resolvedInputs
    .map((input) => (input.status === 'ready' ? `ready:${input.value}:${input.items?.length ?? ''}` : input.status))
    .join('|');

  // "Limpar dados": clears the shown result on demand, independent of any field changing.
  useEffect(() => {
    setShown(null);
    setError(null);
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0) return;
    // A field still unset: a true no-op that leaves whatever is shown alone (see CalcInputs).
    if (isUnsetLiteral(fields.first) || isUnsetLiteral(fields.second)) return;

    const [first = missing, second = missing] = resolvedInputs;
    if (first.status === 'cycle' || second.status === 'cycle') {
      setError('Referência circular entre operações.');
      onResultChange(null, true);
      return;
    }
    if (first.status === 'missing' || second.status === 'missing') {
      setError('Uma das entradas já não existe.');
      onResultChange(null, true);
      return;
    }
    if (first.status !== 'ready' || second.status !== 'ready') {
      // Still waiting for what it reads: nothing to show yet.
      setShown(null);
      setError(null);
      onResultChange(null);
      return;
    }
    const next = { first: describeInput(first), second: describeInput(second) };
    setError(null);
    setShown(next);
    onResultChange(`${next.first} | ${next.second}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, resolvedKey]);

  return (
    <>
      <ValueSourceField
        label="Valor principal"
        placeholder="Introduza um valor"
        inputType="text"
        source={fields.first}
        onChange={(first) => updateFields({ first })}
        referenceOptions={referenceOptions}
        resolvedInput={resolvedInputs[0] ?? missing}
      />
      <ValueSourceField
        label="Detalhe"
        placeholder="Introduza um valor"
        inputType="text"
        source={fields.second}
        onChange={(second) => updateFields({ second })}
        referenceOptions={referenceOptions}
        resolvedInput={resolvedInputs[1] ?? missing}
      />

      {error && <p className="operation-entry__result operation-entry__result--empty">{error}</p>}

      {shown && (
        <>
          <p className="operation-entry__result">
            <span className="operation-entry__result-label">Saída:</span> {shown.first}
          </p>
          <p className="operation-entry__result">
            <span className="operation-entry__result-label">Saída:</span> {shown.second}
          </p>
        </>
      )}
    </>
  );
}
