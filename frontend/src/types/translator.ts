/** How a translator reads its rules: each maps one exact source value ("fixed"), or a numeric interval ("range"). */
export type TranslatorType = 'fixed' | 'range';

/**
 * One entry of a translator operation's mapping table — see TranslatorRequestPayload. A fixed rule uses `from`; a range
 * rule uses `min` and `max` (both inclusive, as the user typed them; an empty one means "no limit").
 */
export interface TranslatorRule {
  from: string;
  to: string;
  min?: string;
  max?: string;
}

export interface TranslatorRequestPayload {
  input: string;
  /** Absent means fixed (what a translator made before the type existed is). */
  type?: TranslatorType;
  rules: TranslatorRule[];
}

/**
 * There's no "not found" flag here (unlike LookupResponsePayload/FindResponsePayload) — a value
 * with no matching rule is a rejected request (see datasetApi's translateValue), not a quiet
 * non-match, so a response only ever carries a successful translation.
 */
export interface TranslatorResponsePayload {
  value: string;
}
