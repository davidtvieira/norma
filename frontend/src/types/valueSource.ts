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

/**
 * Reads a kind's chainable input, if it has one. Not every kind does (e.g. sum's range is
 * picked directly from the sheet, with nothing left to type or chain) — those fall back to an
 * empty literal, which never contributes an edge to the reference graph in
 * utils/resolveOperationInputs.ts.
 */
export function getInputSource(fields: object): ValueSource {
  return (fields as unknown as Partial<ChainableFields>).input ?? literalSource('');
}
