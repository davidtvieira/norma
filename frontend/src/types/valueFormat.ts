/** What kind of value a formatter lets an input hold. */
export type ValueType = 'text' | 'integer' | 'decimal';

/**
 * The rules of a formatter operation (mirrors the backend's ValueFormat): the value's type and its limits. A limit that
 * is null is not set. `minLength`/`maxLength` count the characters of a text; `min`/`max` bound an integer or a decimal.
 */
export interface ValueFormat {
  type: ValueType;
  required: boolean;
  minLength: number | null;
  maxLength: number | null;
  min: number | null;
  max: number | null;
}

export type FormatResult = { ok: true; value: string } | { ok: false; message: string };

/** What each type is called. */
export const TYPE_LABELS: Record<ValueType, string> = { text: 'Texto', integer: 'Número inteiro', decimal: 'Número decimal' };

/** The rules a new formatter starts with: any text. */
export const DEFAULT_VALUE_FORMAT: ValueFormat = { type: 'text', required: false, minLength: null, maxLength: null, min: null, max: null };

/**
 * Checks `value` against the rules, the same way the backend's OperationSupport.applyFormat does (the two are independent
 * implementations of one rule, not shared code): ok with the value as the model carries it on — unchanged for a text, a
 * number written canonically ("007" and "7,50" become "7" and "7.5") — or the Portuguese message of the rule it breaks. An
 * empty value passes unless the rules require one.
 */
export function formatValue(format: ValueFormat, value: string): FormatResult {
  if (value.trim() === '') {
    return format.required ? { ok: false, message: 'É obrigatório indicar um valor.' } : { ok: true, value };
  }
  if (format.type === 'text') {
    const length = [...value].length;
    if (format.minLength !== null && length < format.minLength) {
      return { ok: false, message: `São precisos pelo menos ${format.minLength} caracteres (tem ${length}).` };
    }
    if (format.maxLength !== null && length > format.maxLength) {
      return { ok: false, message: `São permitidos no máximo ${format.maxLength} caracteres (tem ${length}).` };
    }
    return { ok: true, value };
  }

  const trimmed = value.trim();
  const canonical = format.type === 'integer' ? canonicalInteger(trimmed) : canonicalDecimal(trimmed.replace(',', '.'));
  if (canonical === null) {
    return { ok: false, message: format.type === 'integer' ? 'Não é um número inteiro.' : 'Não é um número.' };
  }
  const number = Number(canonical);
  if (format.min !== null && number < format.min) return { ok: false, message: `Tem de ser pelo menos ${format.min}.` };
  if (format.max !== null && number > format.max) return { ok: false, message: `Tem de ser no máximo ${format.max}.` };
  return { ok: true, value: canonical };
}

/** "+007" -> "7", "-0" -> "0"; null when it is not a whole number. */
function canonicalInteger(text: string): string | null {
  const match = /^([+-]?)(\d+)$/.exec(text);
  if (!match) return null;
  const digits = match[2].replace(/^0+(?=\d)/, '');
  return match[1] === '-' && digits !== '0' ? `-${digits}` : digits;
}

/** "7.50" -> "7.5", ".5" -> "0.5", "0.000" -> "0"; null when it is not a number. */
function canonicalDecimal(text: string): string | null {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const unsigned = fraction ? `${whole}.${fraction}` : whole;
  return match[1] === '-' && unsigned !== '0' ? `-${unsigned}` : unsigned;
}

/** Whether the limits contradict each other (a minimum above its maximum), so the rules can't be confirmed. */
export function isFormatConsistent(format: ValueFormat): boolean {
  if (format.minLength !== null && format.maxLength !== null && format.minLength > format.maxLength) return false;
  if (format.min !== null && format.max !== null && format.min > format.max) return false;
  return true;
}

/** "Texto · máx. 10 · obrigatório" — what the rules say, in a line. */
export function describeFormat(f: ValueFormat): string {
  const parts: string[] = [TYPE_LABELS[f.type]];
  if (f.type === 'text') {
    if (f.minLength !== null && f.maxLength !== null) parts.push(`${f.minLength} a ${f.maxLength} caracteres`);
    else if (f.maxLength !== null) parts.push(`máx. ${f.maxLength} caracteres`);
    else if (f.minLength !== null) parts.push(`mín. ${f.minLength} caracteres`);
  } else if (f.min !== null && f.max !== null) {
    parts.push(`${f.min} a ${f.max}`);
  } else if (f.max !== null) {
    parts.push(`máx. ${f.max}`);
  } else if (f.min !== null) {
    parts.push(`mín. ${f.min}`);
  }
  if (f.required) parts.push('obrigatório');
  return parts.join(' · ');
}

/** The rules one per line ("Tipo: Texto", "Máximo: 10 caracteres", "Obrigatório"), for a dialog that lists them. */
export function describeFormatLines(f: ValueFormat): string[] {
  const lines = [`Tipo: ${TYPE_LABELS[f.type]}`];
  if (f.type === 'text') {
    if (f.minLength !== null) lines.push(`Mínimo: ${f.minLength} caracteres`);
    if (f.maxLength !== null) lines.push(`Máximo: ${f.maxLength} caracteres`);
  } else {
    if (f.min !== null) lines.push(`Valor mínimo: ${f.min}`);
    if (f.max !== null) lines.push(`Valor máximo: ${f.max}`);
  }
  if (f.required) lines.push('Obrigatório (não pode ficar vazio)');
  return lines;
}

/**
 * What a field holding a value under these rules lets through while it is being typed: the text the field shows after the
 * user changed it from `previous` to `next`. Characters that can't be part of the type are dropped (letters in a number,
 * a second decimal separator, a sign anywhere but the start), a text is cut at its maximum length, and a number that
 * would go past its maximum (or, negative, below its minimum) is refused — the field keeps `previous`. Limits that can only
 * be met once the whole value is typed (a minimum length, a positive number's minimum) are left to formatValue.
 */
export function constrainTyping(format: ValueFormat, previous: string, next: string): string {
  if (format.type === 'text') {
    const characters = [...next];
    return format.maxLength !== null && characters.length > format.maxLength ? characters.slice(0, format.maxLength).join('') : next;
  }
  const sign = next.startsWith('-') || next.startsWith('+') ? next[0] : '';
  let separator = false;
  let body = '';
  for (const character of next.slice(sign.length)) {
    if (/\d/.test(character)) body += character;
    else if (format.type === 'decimal' && (character === '.' || character === ',') && !separator) {
      separator = true;
      body += character;
    }
  }
  const typed = sign + body;
  const number = Number(body.replace(',', '.') || '0');
  if (sign !== '-' && format.max !== null && number > format.max) return previous;
  if (sign === '-' && format.min !== null && -number < format.min) return previous;
  return typed;
}

/**
 * Every rule the value breaks, as messages (none when it obeys them all): what an error badge counts and shows. An empty
 * value passes — a missing required value is not a card's error, it only keeps the model from running (see ModelCard) —
 * except with `leftEmpty`, for a field the user has left: then an empty value is held to the minimums too (a text's
 * minimum length, a number's minimum).
 */
export function formatErrors(format: ValueFormat, value: string, leftEmpty = false): string[] {
  if (value.trim() === '') {
    if (!leftEmpty || format.required) return [];
    if (format.type === 'text' && format.minLength !== null && format.minLength > 0) {
      return [`São precisos pelo menos ${format.minLength} caracteres (tem 0).`];
    }
    if (format.type !== 'text' && format.min !== null) return [`Tem de ser pelo menos ${format.min}.`];
    return [];
  }
  const result = formatValue(format, value);
  return result.ok ? [] : [result.message];
}
