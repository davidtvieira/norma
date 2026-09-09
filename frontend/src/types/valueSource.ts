/**
 * The value feeding an operation's chainable input (lookup's query, sum's start row): either
 * typed directly by the user, or taken from another operation's live result. This is the
 * frontend-only stand-in for what will eventually be a pipeline the backend understands —
 * for now the chain is resolved entirely client-side (see utils/resolveOperationInputs.ts).
 */
export type ValueSource = { type: 'literal'; value: string } | { type: 'reference'; operationId: string };

export function literalSource(value: string): ValueSource {
  return { type: 'literal', value };
}

/** Fields shape a chainable operation kind exposes, regardless of its other fields. */
export interface ChainableFields {
  input: ValueSource;
}

/** Fields shape a kind with *several* chainable inputs exposes (e.g. counter, which sums
 * however many it's given) — a list instead of the single `input` above. */
export interface MultiChainableFields {
  inputs: ValueSource[];
}

/**
 * Reads a kind's chainable input, if it has one. Not every kind does (e.g. sum's range is
 * picked directly from the sheet, with nothing left to type or chain) — those fall back to an
 * empty literal, which never contributes an edge to the reference graph in
 * utils/resolveOperationInputs.ts. For a kind with several chainable inputs (see
 * MultiChainableFields) this only ever returns the first — kind-specific code that means "the"
 * one input (e.g. a model's designated input field, always a single-input kind) should use this;
 * generic code that must see every chainable field regardless of kind (canvas edges, the
 * reference graph, model export) should use getInputSources instead.
 */
export function getInputSource(fields: object): ValueSource {
  return getInputSources(fields)[0] ?? literalSource('');
}

/**
 * Reads every chainable value source a kind's fields hold, regardless of whether it exposes one
 * (`input`) or several (`inputs`, e.g. counter). Kinds with neither fall back to a single empty
 * literal, same as getInputSource, so callers can always assume at least one entry.
 */
export function getInputSources(fields: object): ValueSource[] {
  const f = fields as Partial<ChainableFields> & Partial<MultiChainableFields>;
  if (Array.isArray(f.inputs)) {
    return f.inputs;
  }
  return [f.input ?? literalSource('')];
}
