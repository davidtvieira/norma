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

function isValueSource(value: unknown): value is ValueSource {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; value?: unknown; operationId?: unknown };
  return (
    (candidate.type === 'literal' && typeof candidate.value === 'string') ||
    (candidate.type === 'reference' && typeof candidate.operationId === 'string')
  );
}

/**
 * Reads every chainable value source a kind's fields hold. A kind with a *list* of them (e.g.
 * counter's "inputs") is returned as-is, empty list included — an empty list is a meaningful "no
 * inputs yet" state there, not "nothing chainable here at all". Otherwise, every OTHER field
 * that's itself a value source is collected, in object-key order — not just "input" (lookup's
 * query, node's/find's value, ...), but any additional named chainable field a kind adds too
 * (e.g. lookup's own "searchColumn", dynamically chainable off another operation's result, most
 * notably a find's). A kind with no chainable field anywhere falls back to a single empty
 * literal, so callers can always assume at least one entry in that case.
 */
export function getInputSources(fields: object): ValueSource[] {
  const f = fields as Record<string, unknown>;

  if (Array.isArray(f.inputs)) {
    return f.inputs as ValueSource[];
  }

  const sources: ValueSource[] = [];
  for (const value of Object.values(f)) {
    if (isValueSource(value)) {
      sources.push(value);
    }
  }
  return sources.length > 0 ? sources : [literalSource('')];
}
