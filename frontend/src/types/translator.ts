/** One entry of a translator operation's mapping table — see TranslatorRequestPayload. */
export interface TranslatorRule {
  from: string;
  to: string;
}

export interface TranslatorRequestPayload {
  input: string;
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
