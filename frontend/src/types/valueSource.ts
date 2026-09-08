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

/** Fields shape every chainable operation kind must expose, regardless of its other fields. */
export interface ChainableFields {
  input: ValueSource;
}

export function getInputSource(fields: object): ValueSource {
  return (fields as unknown as ChainableFields).input;
}
