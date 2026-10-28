import { getInputSource, literalSource } from '../types/valueSource';
import { constrainTyping, type ValueFormat } from '../types/valueFormat';

/**
 * A change to an operation's fields, with the typed "input" held to a formatter's rules as it is typed (see
 * constrainTyping): what the field would hold is cut or refused before it is ever stored. Anything else in the change, and
 * an input that isn't a typed literal (a reference to another operation), goes through untouched.
 */
export function constrainInputPatch(format: ValueFormat | null | undefined, currentFields: object, patch: Record<string, unknown>): Record<string, unknown> {
  const next = patch.input as { type?: string; value?: unknown } | undefined;
  if (!format || next?.type !== 'literal' || typeof next.value !== 'string') return patch;
  const current = getInputSource(currentFields);
  const previous = current.type === 'literal' ? current.value : '';
  return { ...patch, input: literalSource(constrainTyping(format, previous, next.value)) };
}
