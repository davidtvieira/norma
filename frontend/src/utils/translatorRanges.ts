import type { TranslatorRule } from '../types/translator';

/** A range bound as a number: null for an empty one ("no limit"), NaN for text that is not a number (a comma is a decimal separator). */
export function parseBound(text: string | undefined): number | null {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * What stops a set of range rules from being used, in Portuguese for the card (the same checks the backend makes, OperationSupport's
 * validateRangeRules — two independent implementations of one rule): a rule with no bounds, a bound that is not a number, a
 * lower bound above its upper one, and two intervals sharing a value (the bounds are inclusive, so 1–5 and 5–9 overlap). Empty
 * when the rules are fine.
 */
export function rangeProblems(rules: TranslatorRule[]): string[] {
  const problems: string[] = [];
  const intervals: { min: number; max: number }[] = [];
  let boundless = false;
  let notNumber = false;
  let inverted = false;
  for (const rule of rules) {
    const min = parseBound(rule.min);
    const max = parseBound(rule.max);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      notNumber = true;
      continue;
    }
    if (min === null && max === null) {
      boundless = true;
      continue;
    }
    if (min !== null && max !== null && min > max) {
      inverted = true;
      continue;
    }
    intervals.push({ min: min ?? Number.NEGATIVE_INFINITY, max: max ?? Number.POSITIVE_INFINITY });
  }
  if (notNumber) problems.push('Os limites têm de ser números.');
  if (boundless) problems.push('Cada intervalo precisa de pelo menos um limite.');
  if (inverted) problems.push('O limite inferior não pode ser maior que o superior.');
  const sorted = [...intervals].sort((a, b) => a.min - b.min);
  if (sorted.some((interval, index) => index > 0 && sorted[index - 1].max >= interval.min)) {
    problems.push('Dois intervalos não podem ter valores em comum (os limites contam).');
  }
  return problems;
}

/** A short description of one rule's interval: "≤ 8", "9 – 13", "≥ 14". */
export function describeRange(rule: TranslatorRule): string {
  const min = (rule.min ?? '').trim();
  const max = (rule.max ?? '').trim();
  if (min !== '' && max !== '') return `${min} – ${max}`;
  if (max !== '') return `≤ ${max}`;
  if (min !== '') return `≥ ${min}`;
  return '—';
}
