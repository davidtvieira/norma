import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/datasetApi', () => ({
  importNrm: vi.fn(),
  validateNrm: vi.fn().mockResolvedValue({ name: 'x', createdAt: '2026-01-01T00:00:00Z' }),
}));

import { buildNrmFile, extractNrmFile, NrmImportError, readModelFile } from './nrmSerialization';
import type { ExportedModel } from './modelSerialization';

function nrmFile(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], 'modelo.nrm');
}

describe('extractNrmFile', () => {
  it('splits a .nrm into its dataset file and model JSON text', async () => {
    const file = nrmFile({
      'dados.xlsx': strToU8('fake-xlsx-bytes'),
      'modelo.json': strToU8('{"operations":[]}'),
    });

    const { datasetFile, modelText } = await extractNrmFile(file);

    expect(datasetFile?.name).toBe('dados.xlsx');
    expect(await datasetFile?.text()).toBe('fake-xlsx-bytes');
    expect(modelText).toBe('{"operations":[]}');
  });

  it('matches entries by extension regardless of folder nesting or filename', async () => {
    const file = nrmFile({
      'bundle/conjunto.xls': strToU8('old-format-bytes'),
      'bundle/export.json': strToU8('{"operations":[]}'),
    });

    const { datasetFile, modelText } = await extractNrmFile(file);

    expect(datasetFile?.name).toBe('conjunto.xls');
    expect(modelText).toBe('{"operations":[]}');
  });

  it('reads a zip with no spreadsheet entry as a norma without a dataset', async () => {
    const file = nrmFile({ 'modelo.json': strToU8('{"operations":[]}') });
    await expect(extractNrmFile(file)).resolves.toMatchObject({ datasetFile: null });
  });

  it('rejects a zip with no model entry', async () => {
    const file = nrmFile({ 'dados.xlsx': strToU8('bytes') });
    await expect(extractNrmFile(file)).rejects.toBeInstanceOf(NrmImportError);
  });

  it('rejects a zip with more than one spreadsheet entry', async () => {
    const file = nrmFile({
      'a.xlsx': strToU8('bytes'),
      'b.xls': strToU8('bytes'),
      'modelo.json': strToU8('{"operations":[]}'),
    });
    await expect(extractNrmFile(file)).rejects.toBeInstanceOf(NrmImportError);
  });

  it('rejects a zip with more than one model entry', async () => {
    const file = nrmFile({
      'dados.xlsx': strToU8('bytes'),
      'a.json': strToU8('{"operations":[]}'),
      'b.json': strToU8('{"operations":[]}'),
    });
    await expect(extractNrmFile(file)).rejects.toBeInstanceOf(NrmImportError);
  });

  it('rejects a file that is not actually a zip', async () => {
    const file = new File([strToU8('not a zip')], 'modelo.nrm');
    await expect(extractNrmFile(file)).rejects.toBeInstanceOf(NrmImportError);
  });
});

const SAMPLE_MODEL: ExportedModel = {
  modelName: 'Modelo de Teste',
  datasetId: 'dataset-1',
  inputOperationIds: [],
  outputOperationIds: ['op1'],
  operations: [
    { id: 'op1', kind: 'find', name: 'Soma', fields: { sheetIndex: 0 }, position: { x: 0, y: 0 }, operations: [] },
  ],
};

describe('a norma description', () => {
  it('is written to info.json, read back, and kept out of the model inside the .nrm', async () => {
    const model = { ...SAMPLE_MODEL, nrmDescription: 'ignored here' };
    const blob = await buildNrmFile(new File([strToU8('bytes')], 'd.xlsx'), model, 'Com nota', undefined, '  Rastreio de sintomas  ');
    const { info, modelText } = await extractNrmFile(new File([await blob.arrayBuffer()], 'x.nrm'));

    expect(info?.description).toBe('Rastreio de sintomas');
    expect(JSON.parse(modelText)).not.toHaveProperty('nrmDescription');
  });

  it('is simply absent when there is none', async () => {
    const blob = await buildNrmFile(new File([strToU8('bytes')], 'd.xlsx'), SAMPLE_MODEL, 'Sem nota', undefined, '   ');
    const { info } = await extractNrmFile(new File([await blob.arrayBuffer()], 'x.nrm'));
    expect(info?.description).toBeUndefined();
  });
});

describe('a .nrm without a dataset', () => {
  it('is built with no spreadsheet, and reads back with no dataset file', async () => {
    const blob = await buildNrmFile(null, SAMPLE_MODEL, 'Sem dados');
    const { datasetFile, modelText } = await extractNrmFile(new File([await blob.arrayBuffer()], 'x.nrm'));

    expect(datasetFile).toBeNull();
    expect(JSON.parse(modelText)).toEqual({ ...SAMPLE_MODEL, modelName: 'Sem dados', nrmName: 'Sem dados' });
  });

  it('is accepted whatever its info.json holds, since nothing in the file says it has a dataset', async () => {
    const info = (extra: object) => strToU8(JSON.stringify({ name: 'x', createdAt: '2026-01-01T00:00:00Z', ...extra }));
    const without = (extra: object) => nrmFile({ 'modelo.json': strToU8('{"operations":[]}'), 'info.json': info(extra) });

    await expect(extractNrmFile(without({}))).resolves.toMatchObject({ datasetFile: null });
    // A file an older build made still reads (its version is simply ignored).
    await expect(extractNrmFile(without({ version: 1 }))).resolves.toMatchObject({ datasetFile: null });
    await expect(extractNrmFile(without({ version: 2 }))).resolves.toMatchObject({ datasetFile: null });
  });

  it('writes no version, with or without a dataset', async () => {
    for (const dataset of [new File([strToU8('bytes')], 'd.xlsx'), null]) {
      const blob = await buildNrmFile(dataset, SAMPLE_MODEL, 'Nome');
      const { info, modelText } = await extractNrmFile(new File([await blob.arrayBuffer()], 'x.nrm'));
      expect(info).not.toHaveProperty('version');
      expect(JSON.parse(modelText)).not.toHaveProperty('version');
    }
  });
});

describe('buildNrmFile', () => {
  it('round-trips with extractNrmFile: same dataset bytes, dataset and model renamed to the export name', async () => {
    const datasetFile = new File([strToU8('fake-xlsx-bytes')], 'vendas.xlsx');

    const nrmBlob = await buildNrmFile(datasetFile, SAMPLE_MODEL, 'Relatório de vendas');
    const nrmFile = new File([await nrmBlob.arrayBuffer()], 'modelo.nrm');
    const { datasetFile: extractedDatasetFile, modelText, info } = await extractNrmFile(nrmFile);

    expect(extractedDatasetFile?.name).toBe('Relatório de vendas.xlsx');
    expect(await extractedDatasetFile?.text()).toBe('fake-xlsx-bytes');
    expect(JSON.parse(modelText)).toEqual({ ...SAMPLE_MODEL, modelName: 'Relatório de vendas', nrmName: 'Relatório de vendas' });
    expect(info?.name).toBe('Relatório de vendas');
    expect(Number.isNaN(Date.parse(info?.createdAt ?? ''))).toBe(false);
  });

  it('does not mistake info.json for the model, and reads a .nrm without one as info: null', async () => {
    const withoutInfo = new File([zipSync({ 'dados.xlsx': strToU8('b'), 'modelo.json': strToU8('{"operations":[]}') })], 'a.nrm');
    expect((await extractNrmFile(withoutInfo)).info).toBeNull();

    const malformedInfo = new File(
      [zipSync({ 'dados.xlsx': strToU8('b'), 'modelo.json': strToU8('{"operations":[]}'), 'info.json': strToU8('not json') })],
      'b.nrm',
    );
    expect((await extractNrmFile(malformedInfo)).info).toBeNull();
  });
});

describe('readModelFile', () => {
  it('reads a .nrm file by extracting just its model JSON', async () => {
    const zipped = zipSync({
      'dados.xlsx': strToU8('bytes'),
      'modelo.json': strToU8(JSON.stringify(SAMPLE_MODEL)),
    });
    const file = new File([zipped], 'modelo.nrm');

    const text = await readModelFile(file);
    expect(JSON.parse(text)).toEqual(SAMPLE_MODEL);
  });

  it('reads a plain .json file as-is (a model exported before .nrm existed)', async () => {
    const file = new File([JSON.stringify(SAMPLE_MODEL)], 'modelo.json');

    const text = await readModelFile(file);
    expect(JSON.parse(text)).toEqual(SAMPLE_MODEL);
  });
});
