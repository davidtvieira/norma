import { describe, expect, it } from 'vitest';
import { buildModelExport, parseModelImport, ModelImportError, type SerializableEntry } from './modelSerialization';
import { literalSource } from '../types/valueSource';

const KNOWN_KIND_IDS = new Set(['lookup', 'find', 'node', 'formatter', 'page', 'iterator']);

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
      entry({ id: 'op-1', kindId: 'find', name: 'Total', fields: { sheetIndex: 0 }, position: { x: 10, y: 20 } }),
    ];

    const exported = buildModelExport(entries, 'My model', 'dataset-1', [], ['op-1']);
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);

    expect(imported.entries).toEqual(entries);
    expect(imported.modelName).toBe('My model');
    expect(imported.datasetId).toBe('dataset-1');
    expect(imported.outputOperationIds).toEqual(['op-1']);
  });

  it('carries the norma description when there is one, and none when there is not', () => {
    const entries = [entry({ id: 'op-1', kindId: 'node' })];

    const described = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1'], 'Nome', '  Para que serve  ');
    expect(described.nrmDescription).toBe('Para que serve');
    expect(parseModelImport(JSON.stringify(described), KNOWN_KIND_IDS).nrmDescription).toBe('Para que serve');

    const plain = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1'], 'Nome');
    expect(plain).not.toHaveProperty('nrmDescription');
    expect(parseModelImport(JSON.stringify(plain), KNOWN_KIND_IDS).nrmDescription).toBe('');
  });

  it('keeps the validation rule sets in the settings, out of the operations, and reads them back', () => {
    const rules = { type: 'integer', required: true, min: 0, max: 9, appliesTo: ['op-1'] };
    const entries = [
      entry({ id: 'op-1', kindId: 'node' }),
      entry({ id: 'rules-1', kindId: 'formatter', name: 'Perguntas', fields: rules, position: undefined }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', ['op-1'], ['op-1']);

    expect(exported.operations.map((operation) => operation.id)).toEqual(['op-1']);
    expect(exported.settings).toEqual({ validation: [{ id: 'rules-1', name: 'Perguntas', fields: rules }] });
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);
    expect(imported.entries.map((item) => [item.id, item.kindId, item.name, item.confirmed])).toEqual([
      ['op-1', 'node', 'op-1', true],
      ['rules-1', 'formatter', 'Perguntas', true],
    ]);
    expect(imported.entries[1].fields).toEqual(rules);
  });

  it('keeps the page selector in the settings too, out of the operations, and reads it back', () => {
    const page = { input: { type: 'reference', operationId: 'op-1' } };
    const entries = [
      entry({ id: 'op-1', kindId: 'node' }),
      entry({ id: 'page-1', kindId: 'page', name: 'Selecionar Página', fields: page, position: undefined }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1']);

    expect(exported.operations.map((operation) => operation.id)).toEqual(['op-1']);
    expect(exported.settings).toEqual({ page: { id: 'page-1', name: 'Selecionar Página', fields: page } });
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);
    expect(imported.entries.map((item) => [item.id, item.kindId])).toEqual([['op-1', 'node'], ['page-1', 'page']]);
    expect(imported.entries[1].fields).toEqual(page);
  });

  it('keeps the iteration in the settings, out of the operations, and reads it back', () => {
    const iteration = { startSheet: 1, endSheet: 3, previewSheet: '', descriptions: ['A', 'B', 'C'] };
    const entries = [
      entry({ id: 'op-1', kindId: 'node', fields: { input: { type: 'reference', operationId: 'it-1' } } }),
      entry({ id: 'it-1', kindId: 'iterator', name: 'Iterador de Páginas', fields: iteration, position: undefined }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1']);

    expect(exported.operations.map((operation) => operation.id)).toEqual(['op-1']);
    expect(exported.settings).toEqual({ iteration: { id: 'it-1', name: 'Iterador de Páginas', fields: iteration } });
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);
    expect(imported.entries.map((item) => [item.id, item.kindId])).toEqual([['op-1', 'node'], ['it-1', 'iterator']]);
    expect(imported.entries[1].fields).toEqual(iteration);
  });

  it('carries the validation rule sets and the page selector side by side', () => {
    const entries = [
      entry({ id: 'op-1', kindId: 'node' }),
      entry({ id: 'rules-1', kindId: 'formatter', fields: { type: 'text' }, position: undefined }),
      entry({ id: 'page-1', kindId: 'page', fields: { input: { type: 'literal', value: '0' } }, position: undefined }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', [], ['op-1']);

    expect(Object.keys(exported.settings ?? {}).sort()).toEqual(['page', 'validation']);
  });

  it('has no settings at all for a model without validation rules', () => {
    const exported = buildModelExport([entry({ id: 'op-1', kindId: 'node' })], 'Model', 'dataset-1', [], ['op-1']);

    expect(exported).not.toHaveProperty('settings');
  });

  it('refuses a setting (a validation rule set, the page selector, the iterator) among the operations', () => {
    for (const kind of ['formatter', 'page', 'iterator']) {
      const model = { modelName: 'M', operations: [{ id: 'x', kind, name: 'X', fields: {}, position: { x: 0, y: 0 }, operations: [] }] };

      expect(() => parseModelImport(JSON.stringify(model), KNOWN_KIND_IDS)).toThrow(ModelImportError);
    }
  });

  it('refuses settings that are malformed', () => {
    const base = { modelName: 'M', operations: [] };

    expect(() => parseModelImport(JSON.stringify({ ...base, settings: { validation: 3 } }), KNOWN_KIND_IDS)).toThrow(ModelImportError);
    expect(() => parseModelImport(JSON.stringify({ ...base, settings: { validation: [{ id: 'x' }] } }), KNOWN_KIND_IDS)).toThrow(ModelImportError);
    expect(() => parseModelImport(JSON.stringify({ ...base, settings: { page: { id: 'x' } } }), KNOWN_KIND_IDS)).toThrow(ModelImportError);
    expect(() => parseModelImport(JSON.stringify({ ...base, settings: { iteration: { id: 'x' } } }), KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });

  it('drops unconfirmed (draft) entries from the export entirely', () => {
    const entries = [
      entry({ id: 'op-1', kindId: 'find', confirmed: true }),
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
      entry({ id: 'op-c', kindId: 'find' }),
    ];

    const exported = buildModelExport(entries, 'Model', 'dataset-1', ['op-a', 'op-b'], ['op-c']);
    const imported = parseModelImport(JSON.stringify(exported), KNOWN_KIND_IDS);

    expect(imported.inputOperationIds).toEqual(['op-a', 'op-b']);
    expect(imported.outputOperationIds).toEqual(['op-c']);
  });

  it('reads a model with no input or output ids as having none', () => {
    const json = JSON.stringify({
      modelName: 'Model',
      datasetId: 'dataset-1',
      operations: [{ id: 'op-a', kind: 'node', name: 'Input', fields: {}, position: { x: 0, y: 0 }, operations: [] }],
    });

    const imported = parseModelImport(json, KNOWN_KIND_IDS);

    expect(imported.inputOperationIds).toEqual([]);
    expect(imported.outputOperationIds).toEqual([]);
  });

  it('tolerates a node with no saved position by leaving it undefined, not rejecting the import', () => {
    const json = JSON.stringify({
      modelName: 'Model',
      datasetId: 'dataset-1',
      inputOperationIds: [],
      outputOperationIds: ['op-1'],
      operations: [{ id: 'op-1', kind: 'find', name: 'Total', fields: {}, operations: [] }],
    });

    const imported = parseModelImport(json, KNOWN_KIND_IDS);

    expect(imported.entries[0].position).toBeUndefined();
  });

  it('rejects a model referencing an operation kind the app does not know', () => {
    const json = JSON.stringify({
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
      modelName: 'Model',
      datasetId: 'dataset-1',
      operations: [{ id: 'op-1', kind: 'find' }],
    });

    expect(() => parseModelImport(json, KNOWN_KIND_IDS)).toThrow(ModelImportError);
  });
});
