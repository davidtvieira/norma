import { describe, expect, it } from 'vitest';
import { getDependents, resolveOperationInputs, type ChainableEntry } from './resolveOperationInputs';
import { literalSource, type ValueSource } from '../types/valueSource';

function reference(operationId: string): ValueSource {
  return { type: 'reference', operationId };
}

function entry(id: string, fields: object, confirmed = true): ChainableEntry {
  return { id, confirmed, fields };
}

/**
 * This module's cycle detection is an independent, hand-ported copy of the same DFS-coloring
 * algorithm the backend's ModelExecutionService (buildReferenceGraph/findCyclicIds) implements in
 * Java — see CLAUDE.md's note on that duplication. These cases mirror the ones
 * ModelExecutionServiceTest exercises on the Java side (self/mutual reference, a cycle reached
 * only through a kind's second chainable field, a cycle not blocking an unrelated operation) so a
 * change to what counts as a cycle can't drift between the two without at least one suite
 * catching it.
 */
describe('resolveOperationInputs', () => {
  it('resolves a literal input immediately, regardless of other entries', () => {
    const entries = [entry('op-1', { input: literalSource('42') })];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-1']).toEqual([{ status: 'ready', value: '42' }]);
  });

  it('resolves a reference to a confirmed operation once its result is available', () => {
    const entries = [
      entry('op-a', { input: literalSource('x') }),
      entry('op-b', { input: reference('op-a') }),
    ];

    const resolved = resolveOperationInputs(entries, { 'op-a': 'Bruno' });

    expect(resolved['op-b']).toEqual([{ status: 'ready', value: 'Bruno' }]);
  });

  it('reports pending while the referenced operation has no result yet', () => {
    const entries = [
      entry('op-a', { input: literalSource('x') }),
      entry('op-b', { input: reference('op-a') }),
    ];

    const resolved = resolveOperationInputs(entries, { 'op-a': null });

    expect(resolved['op-b']).toEqual([{ status: 'pending' }]);
  });

  it('reports missing when the reference points at an unconfirmed (draft) operation', () => {
    const entries = [
      entry('op-a', { input: literalSource('x') }, false),
      entry('op-b', { input: reference('op-a') }),
    ];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-b']).toEqual([{ status: 'missing' }]);
  });

  it('reports missing when the reference points at an id that does not exist at all', () => {
    const entries = [entry('op-1', { input: reference('does-not-exist') })];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-1']).toEqual([{ status: 'missing' }]);
  });

  it('falls back to a single empty literal for a kind with no chainable field at all', () => {
    const entries = [entry('op-1', { sheetIndex: 0 })];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-1']).toEqual([{ status: 'ready', value: '' }]);
  });

  it('flags a direct mutual reference (A -> B -> A) as a cycle for every entry on it', () => {
    const entries = [
      entry('op-a', { input: reference('op-b') }),
      entry('op-b', { input: reference('op-a') }),
    ];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-a']).toEqual([{ status: 'cycle' }]);
    expect(resolved['op-b']).toEqual([{ status: 'cycle' }]);
  });

  it('flags a self-reference as a cycle', () => {
    const entries = [entry('op-1', { input: reference('op-1') })];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-1']).toEqual([{ status: 'cycle' }]);
  });

  it('detects a cycle reached only through one of several chainable inputs (counter-like)', () => {
    // op-a's second input chains to op-b, which chains back to op-a — a cycle reachable through
    // only one of the two inputs, the other being a plain literal. Mirrors
    // ModelExecutionServiceTest#reportsACircularReferenceThroughACountersMultipleInputsAsAnError.
    const entries = [
      entry('op-a', { inputs: [reference('op-b'), literalSource('1')] }),
      entry('op-b', { inputs: [reference('op-a')] }),
    ];

    const resolved = resolveOperationInputs(entries, {});

    // op-a has two chainable inputs, so its cycle status is reported once per input.
    expect(resolved['op-a']).toEqual([{ status: 'cycle' }, { status: 'cycle' }]);
    expect(resolved['op-b']).toEqual([{ status: 'cycle' }]);
  });

  it('does not let a cycle elsewhere in the model affect an unrelated entry', () => {
    const entries = [
      entry('op-a', { input: reference('op-b') }),
      entry('op-b', { input: reference('op-a') }),
      entry('op-c', { input: literalSource('unrelated') }),
    ];

    const resolved = resolveOperationInputs(entries, {});

    expect(resolved['op-c']).toEqual([{ status: 'ready', value: 'unrelated' }]);
  });

  it('resolves every chainable input of a multi-input kind independently, in field order', () => {
    const entries = [
      entry('op-a', { input: literalSource('10') }),
      entry('op-counter', { inputs: [reference('op-a'), literalSource('5')] }),
    ];

    const resolved = resolveOperationInputs(entries, { 'op-a': '10' });

    expect(resolved['op-counter']).toEqual([
      { status: 'ready', value: '10' },
      { status: 'ready', value: '5' },
    ]);
  });
});

describe('getDependents', () => {
  it('finds every entry that transitively depends on the given one', () => {
    const entries = [
      entry('op-a', { input: literalSource('x') }),
      entry('op-b', { input: reference('op-a') }),
      entry('op-c', { input: reference('op-b') }),
      entry('op-unrelated', { input: literalSource('y') }),
    ];

    const dependents = getDependents('op-a', entries);

    expect(dependents).toEqual(new Set(['op-b', 'op-c']));
  });

  it('returns an empty set for an entry nothing else depends on', () => {
    const entries = [
      entry('op-a', { input: literalSource('x') }),
      entry('op-b', { input: literalSource('y') }),
    ];

    expect(getDependents('op-a', entries)).toEqual(new Set());
  });
});
