import { useEffect } from 'react';
import type { OperationFields, OperationKind } from '../operationKind';

interface IteratorFields {
  // The sheets the model runs over, inclusive and by index — a real run executes the whole model
  // once per sheet, in order. Chosen from the dataset's own sheets only (see renderDraftConfig),
  // so the backend's range check can't be tripped from the UI.
  startSheet: number | '';
  endSheet: number | '';
  // Editor-only: which sheet of the range the canvas previews (every sheet-based operation set to
  // use the iterator's sheet runs on this one while testing). Blank means the first sheet.
  previewSheet: number | '';
}

function asIteratorFields(fields: OperationFields): IteratorFields {
  return fields as unknown as IteratorFields;
}

/**
 * The sheet the canvas previews for an iterator's fields: its chosen preview sheet if that is
 * still inside the range, otherwise the first sheet of the range. Null while the range is unset.
 */
export function iteratorPreviewSheet(fields: OperationFields): number | null {
  const f = asIteratorFields(fields);
  if (f.startSheet === '' || f.endSheet === '') return null;
  if (f.previewSheet !== '' && f.previewSheet >= f.startSheet && f.previewSheet <= f.endSheet) return f.previewSheet;
  return f.startSheet;
}

/**
 * Runs the model once per sheet of a range. It has no input and nothing chains into it, so it is
 * always the first thing a run does: the backend repeats the whole model for each sheet in turn
 * (see ModelExecutionService.runIterations), and an iterator's own result is simply the sheet it
 * is currently on, counted from the start of its range (a range of sheets 3-6 outputs 0, 1, 2, 3 —
 * not the sheets' own indexes). While editing there's only ever one "current" sheet, the preview one.
 */
export const iteratorKind: OperationKind = {
  id: 'iterator',

  createFields: (dataset): OperationFields => ({
    startSheet: dataset.sheets.length === 1 ? 0 : '',
    endSheet: dataset.sheets.length === 1 ? 0 : '',
    previewSheet: '',
  } satisfies IteratorFields),

  canConfirm: (fields) => {
    const f = asIteratorFields(fields);
    return f.startSheet !== '' && f.endSheet !== '' && f.startSheet <= f.endSheet;
  },

  renderDraftConfig: ({ dataset, fields, updateFields }) => {
    const f = asIteratorFields(fields);
    return (
      <>
        <div className="operation-entry__field">
          <label className="operation-entry__label">Primeira página</label>
          <select
            className="operation-entry__select"
            value={f.startSheet}
            onChange={(event) => {
              const startSheet = Number(event.target.value);
              // An end before the new start would be an empty range — clear it to be picked again.
              updateFields({ startSheet, endSheet: f.endSheet !== '' && f.endSheet < startSheet ? '' : f.endSheet, previewSheet: '' });
            }}
          >
            <option value="" disabled>
              Selecione uma página
            </option>
            {dataset.sheets.map((sheet, index) => (
              <option key={sheet.sheetName} value={index}>
                {index} · {sheet.sheetName}
              </option>
            ))}
          </select>
        </div>

        <div className="operation-entry__field">
          <label className="operation-entry__label">Última página</label>
          <select
            className="operation-entry__select"
            value={f.endSheet}
            disabled={f.startSheet === ''}
            onChange={(event) => updateFields({ endSheet: Number(event.target.value), previewSheet: '' })}
          >
            <option value="" disabled>
              Selecione uma página
            </option>
            {dataset.sheets.map((sheet, index) => (
              <option key={sheet.sheetName} value={index} disabled={f.startSheet !== '' && index < f.startSheet}>
                {index} · {sheet.sheetName}
              </option>
            ))}
          </select>
        </div>
      </>
    );
  },

  renderSummary: (fields, dataset) => {
    const f = asIteratorFields(fields);
    const start = f.startSheet as number;
    const end = f.endSheet as number;
    const count = end - start + 1;
    return (
      <span>
        {dataset.sheets[start].sheetName}
        {end !== start && ` → ${dataset.sheets[end].sheetName}`} · {count} {count === 1 ? 'página' : 'páginas'}
      </span>
    );
  },

  renderBody: ({ fields, updateFields, sheetNames, testSignal, resetSignal, onResultChange }) => {
    const f = asIteratorFields(fields);
    const preview = iteratorPreviewSheet(fields);
    const sheets: number[] = [];
    if (f.startSheet !== '' && f.endSheet !== '') {
      for (let sheet = f.startSheet; sheet <= f.endSheet; sheet += 1) sheets.push(sheet);
    }

    return (
      <>
        <div className="operation-entry__field">
          <label className="operation-entry__label">Página de pré-visualização</label>
          <select
            className="operation-entry__select"
            value={preview ?? ''}
            onChange={(event) => updateFields({ previewSheet: Number(event.target.value) })}
          >
            {sheets.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet - (f.startSheet as number)} · {sheetNames[sheet] ?? ''}
              </option>
            ))}
          </select>
          <p className="operation-entry__chain-status">
            Aqui o modelo é testado numa página de cada vez. Ao correr o modelo, todas as páginas do intervalo são percorridas.
          </p>
        </div>

        <IteratorResult position={preview === null ? null : preview - (f.startSheet as number)} testSignal={testSignal} resetSignal={resetSignal} onResultChange={onResultChange} />
      </>
    );
  },

  getColumnHighlights: () => [],

  // An iterator isn't tied to any table/column/range of its own — nothing on the sheet to tint.
};

interface IteratorResultProps {
  /** The previewed sheet's position in the iterator's range (0 = its first sheet). */
  position: number | null;
  testSignal: number;
  resetSignal: number;
  onResultChange: (value: string | null, failed?: boolean) => void;
}

/**
 * An iterator needs no API call: its result is just the previewed sheet's position in its range, reported on every
 * test (and whenever the preview sheet changes after one) so operations that reference it can
 * chain off it like any other result.
 */
function IteratorResult({ position, testSignal, resetSignal, onResultChange }: IteratorResultProps) {
  useEffect(() => {
    onResultChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0) return;
    onResultChange(position === null ? null : String(position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, position]);

  if (testSignal === 0 || position === null) return null;

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Índice:</span> {position}
    </p>
  );
}
