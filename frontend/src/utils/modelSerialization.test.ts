import { describe, expect, it } from 'vitest';
import { buildModelExport, parseModelImport, ModelImportError, type SerializableEntry } from './modelSerialization';
import { literalSource } from '../types/valueSource';

const KNOWN_KIND_IDS = new Set(['lookup', 'sum', 'node']);

function entry(overrides: Partial<SerializableEntry> & Pick<SerializableEntry, 'id' | 'kindId'>): SerializableEntry {
  return {
    name: overrides.id,
    confirmed: true,
    fields: { input: literalSource('x') },
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('buildModelExport / parseModelImport round trip', () => {
  it('preserves every confirmed operation, its fields, name and position', () => {
    const entries = [
      entry({ id: 'op-1', kindId: 'sum', name: 'Total', fields: { sheetIndex: 0 }, position: { x: 10, y: 20 } }),
    ];

    const exported = buildModelExport(entries, 'My model', 'dataset-1', [], ['op-1']);
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);

    expect(imported.entries).toEqual(entries);
    expect(imported.modelName).toBe('My model');
    expect(imported.datasetId).toBe('dataset-1');
    expect(imported.outputOperationIds).toEqual(['op-1']);
  });

  it('drops unconfirmed (draft) entries from the export entirely', () => {
    const entries = [
      entry({ id: 'op-1', kindId: 'sum', confirmed: true }),
      entry({ id: 'op-2', kindId: 'node', confirmed: false }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1']);

    expect(exported.operations.map((op) => op.id)).toEqual(['op-1']);
  });

  it('nests an operation under the operation its chainable field references', () => {
    const entries = [
      entry({ id: 'op-a', kindId: 'node', fields: { input: literalSource('Bruno') } }),
      entry({ id: 'op-b', kindId: 'lookup', fields: { input: { type: 'reference', operationId: 'op-a' } } }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-b']);

    expect(exported.operations).toHaveLength(1);
    expect(exported.operations[0].id).toBe('op-a');
    expect(exported.operations[0].operations).toHaveLength(1);
    expect(exported.operations[0].operations[0].id).toBe('op-b');
  });

  it('flattens the nested tree back into a flat entry list on import, losing no relationship', () => {
    const entries = [
      entry({ id: 'op-a', kindId: 'node', fields: { input: literalSource('Bruno') } }),
      entry({ id: 'op-b', kindId: 'lookup', fields: { input: { type: 'reference', operationId: 'op-a' } } }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-b']);
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);

    expect(imported.entries.map((e) => e.id).sort()).toEqual(['op-a', 'op-b']);
    const opB = imported.entries.find((e) => e.id === 'op-b');
    expect(opB?.fields).toEqual({ input: { type: 'reference', operationId: 'op-a' } });
  });

  it('round-trips several designated inputs and outputs', () => {
    const entries = [
      entry({ id: 'op-a', kindId: 'node' }),
      entry({ id: 'op-b', kindId: 'node' }),
      entry({ id: 'op-c', kindId: 'sum' }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', ['op-a', 'op-b'], ['op-c']);
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);

    expect(imported.inputOperationIds).toEqual(['op-a', 'op-b']);
    expect(imported.outputOperationIds).toEqual(['op-c']);
  });

  it('falls back to the legacy singular input/output field for a model exported before it could have several', () => {
    const legacyJson = JSON.stringify({
      version: 1,
      modelName: 'Old model',
      datasetId: 'dataset-1',
      inputOperationId: 'op-a',
      outputOperationId: 'op-b',
      operations: [
        { id: 'op-a', kind: 'node', name: 'Input', fields: {}, position: { x: 0, y: 0 }, operations: [] },
        { id: 'op-b', kind: 'sum', name: 'Output', fields: {}, position: { x: 0, y: 0 }, operations: [] },
      ],
    });

    const imported = parseModelImport(legacyJson, KNOWN_KIND_IDS);

    expect(imported.inputOperationIds).toEqual(['op-a']);
    expect(imported.outputOperationIds).toEqual(['op-b']);
  });

  it('tolerates a node with no saved position by leaving it undefined, not rejecting the import', () => {
    const json = JSON.stringify({
      version: 1,
      modelName: 'Model',
      datasetId: 'dataset-1',
      inputOperationIds: [],
      outputOperationIds: ['op-1'],
      operations: [{ id: 'op-1', kind: 'sum', name: 'Total', fields: {}, operations: [] }],
    });

    const imported = parseModelImport(json, KNOWN_KIND_IDS);

    expect(imported.entries[0].position).toBeUndefined();
  });

  it('rejects a model referencing an operation kind the app does not know', () => {
    const json = JSON.stringify({
      version: 1,
      modelName: 'Model',
      datasetId: 'dataset-1',
      inputOperationIds: [],
      outputOperationIds: ['op-1'],
      operations: [{ id: 'op-1', kind: 'does-not-exist', name: 'X', fields: {}, position: { x: 0, y: 0 }, operations: [] }],
    });

    expect(() => parseModelImport(json, KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseModelImport('not json', KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });

  it('rejects a well-formed JSON document missing the operations array', () => {
    expect(() => parseModelImport(JSON.stringify({ modelName: 'x' }), KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });

  it('rejects an operation missing a required field', () => {
    const json = JSON.stringify({
      version: 1,
      modelName: 'Model',
      datasetId: 'dataset-1',
      operations: [{ id: 'op-1', kind: 'sum' }],
    });

    expect(() => parseModelImport(json, KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });
});
