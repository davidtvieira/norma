import { useEffect, useRef, useState } from 'react';
import type { CellValue } from '../../../types/dataset';
import { lookupValue } from '../../../services/datasetApi';
import { formatCellValue } from '../../../utils/sheet';
import { literalSource, type ValueSource } from '../../../types/valueSource';
import type { LookupMatchMode } from '../../../types/lookup';
import type { OperationHighlight } from '../../../types/highlight';
import type { ResolvedInput } from '../../../utils/resolveOperationInputs';
import { ColumnPickerField, TableSelect, ValueSourceField } from '../fields';
import type { OperationFields, OperationKind } from '../operationKind';

interface LookupFields {
  // The value to search for — typed directly, or chained from another operation's result.
  input: ValueSource;
  // Search and result columns always come from the same table — a lookup matches a row in one
  // table by its search column and reads the result from another column of that same row.
  sheetIndex: number | '';
  // Chainable, same as `input` — typed directly, or (notably) chained from a find operation's
  // own combined "rowIndex,columnIndex" result (see parseColumnIndex below), so a lookup can
  // search whichever column a find elsewhere in the model landed on. Unlike before, no longer
  // picked by clicking a column header directly in the sheet at draft time — see renderBody's
  // own ValueSourceField for it instead, same as the query.
  searchColumn: ValueSource;
  resultColumn: number | '';
  // Skips every row before it when scanning for a match — chainable too, same as searchColumn,
  // including from a find's combined result (its row half this time — see parseRowIndex). "0"
  // (the default) searches from the very first row, same as before this field existed.
  startRow: ValueSource;
  // How the search column's cell is compared against the query — "equals" (the original,
  // default behavior), "contains", or "tokenEquals". Not chainable (a plain fixed setting, same
  // as resultColumn) — it changes how the match is computed, not what value feeds into it.
  matchMode: LookupMatchMode;
  // Only meaningful for matchMode "tokenEquals" — see LookupMatchMode's own doc.
  tokenIgnoreSpaces: boolean;
  tokenIgnoreDashes: boolean;
}

function asLookupFields(fields: OperationFields): LookupFields {
  return fields as unknown as LookupFields;
}

/**
 * Interprets a resolved chainable value as a column index: a plain typed number, or — the
 * motivating case — a find operation's own combined "rowIndex,columnIndex" result, taking
 * whatever's after the last comma when there is one. Mirrors the backend's own parseColumnIndex
 * (DatasetOperationService) exactly, since the same resolved value drives both a live "Testar
 * modelo" click here and a registered model run there.
 */
function parseColumnIndex(resolvedInput: ResolvedInput): number | null {
  if (resolvedInput.status !== 'ready') return null;
  const trimmed = resolvedInput.value.trim();
  const raw = trimmed.includes(',') ? trimmed.slice(trimmed.lastIndexOf(',') + 1).trim() : trimmed;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The row-index counterpart of parseColumnIndex — a chained value can also come from a find
 * operation's combined "rowIndex,columnIndex" result, in which case this takes whatever's
 * *before* the first comma (the row half) rather than the column half. Mirrors the backend's own
 * parseRowIndex exactly.
 */
function parseRowIndex(resolvedInput: ResolvedInput): number | null {
  if (resolvedInput.status !== 'ready') return null;
  const trimmed = resolvedInput.value.trim();
  const raw = trimmed.includes(',') ? trimmed.slice(0, trimmed.indexOf(',')).trim() : trimmed;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export const lookupKind: OperationKind = {
  id: 'lookup',

  createFields: (dataset): OperationFields => ({
    input: literalSource(''),
    sheetIndex: dataset.sheets.length === 1 ? 0 : '',
    searchColumn: literalSource(''),
    resultColumn: '',
    startRow: literalSource('0'),
    matchMode: 'equals',
    tokenIgnoreSpaces: false,
    tokenIgnoreDashes: false,
  } satisfies LookupFields),

  canConfirm: (fields) => asLookupFields(fields).resultColumn !== '',

  renderDraftConfig: ({ dataset, entryId, fields, updateFields, columnPick, onStartColumnPick, onFinishColumnPick }) => {
    const f = asLookupFields(fields);

    return (
      <>
        {dataset.sheets.length > 1 && (
          <div className="operation-entry__columns">
            <TableSelect
              label="Tabela"
              dataset={dataset}
              sheetIndex={f.sheetIndex}
              onSelect={(sheetIndex) =>
                updateFields({ sheetIndex, searchColumn: literalSource(''), resultColumn: '', startRow: literalSource('0') })
              }
            />
          </div>
        )}

        {f.sheetIndex !== '' && (
          <div className="operation-entry__columns">
            <ColumnPickerField
              label="Coluna a devolver"
              value={f.resultColumn}
              isPicking={columnPick?.entryId === entryId && columnPick.field === 'result'}
              pendingColumn={columnPick?.entryId === entryId && columnPick.field === 'result' ? columnPick.column : null}
              onStart={() => onStartColumnPick(entryId, 'result', f.sheetIndex as number)}
              onConfirm={(column) => updateFields({ resultColumn: column })}
              onCancel={onFinishColumnPick}
            />
          </div>
        )}
      </>
    );
  },

  renderSummary: (fields, dataset) => {
    const f = asLookupFields(fields);
    const sheetIndex = f.sheetIndex as number;
    const searchColumnLabel =
      f.searchColumn.type === 'literal'
        ? f.searchColumn.value !== ''
          ? `Coluna ${f.searchColumn.value}`
          : 'Coluna por definir'
        : 'Coluna dinâmica';
    const matchModeLabel = f.matchMode === 'contains' ? 'contém' : f.matchMode === 'tokenEquals' ? 'segmento' : 'igual';
    return (
      <>
        <span>{dataset.sheets[sheetIndex].sheetName}</span>
        <span>
          · {searchColumnLabel} ({matchModeLabel})
          <span className="lookup-summary__arrow">→</span>
          Coluna {f.resultColumn}
        </span>
      </>
    );
  },

  renderInputEditor: ({ fields, updateFields, resolvedInput }) => {
    const f = asLookupFields(fields);
    return (
      <ValueSourceField
        label="Valor a procurar"
        placeholder="Introduza um valor"
        inputType="text"
        source={f.input}
        onChange={(input) => updateFields({ input })}
        referenceOptions={[]}
        resolvedInput={resolvedInput}
      />
    );
  },

  renderBody: ({
    fields,
    updateFields,
    datasetId,
    testSignal,
    resetSignal,
    onMatchChange,
    resolvedInputs,
    referenceOptions,
    onResultChange,
  }) => {
    const f = asLookupFields(fields);
    // "input" (the query), "searchColumn" and "startRow" are all chainable fields on this kind,
    // declared in this order in createFields — resolvedInputs mirrors that order (see
    // getInputSources).
    const queryResolved = resolvedInputs[0];
    const searchColumnResolved = resolvedInputs[1] ?? { status: 'missing' as const };
    const startRowResolved = resolvedInputs[2] ?? { status: 'missing' as const };
    const query = queryResolved.status === 'ready' ? queryResolved.value : '';
    const searchColumn = parseColumnIndex(searchColumnResolved);
    const startRow = parseRowIndex(startRowResolved);

    return (
      <>
        <ValueSourceField
          label="Linha inicial"
          placeholder="Índice da linha"
          inputType="number"
          source={f.startRow}
          onChange={(startRow) => updateFields({ startRow })}
          referenceOptions={referenceOptions}
          resolvedInput={startRowResolved}
        />

        <ValueSourceField
          label="Coluna onde procurar"
          placeholder="Índice da coluna"
          inputType="number"
          source={f.searchColumn}
          onChange={(searchColumn) => updateFields({ searchColumn })}
          referenceOptions={referenceOptions}
          resolvedInput={searchColumnResolved}
        />

        <div className="operation-entry__field">
          <label className="operation-entry__label">Tipo de comparação</label>
          <select
            className="operation-entry__select"
            value={f.matchMode}
            onChange={(event) => updateFields({ matchMode: event.target.value as LookupMatchMode })}
          >
            <option value="equals">Igual (correspondência exata)</option>
            <option value="contains">Contém</option>
            <option value="tokenEquals">Igual (segmento exato)</option>
          </select>
          {f.matchMode === 'tokenEquals' && (
            <div className="operation-entry__checkbox-group">
              <label className="operation-entry__checkbox">
                <input
                  type="checkbox"
                  checked={f.tokenIgnoreSpaces}
                  onChange={(event) => updateFields({ tokenIgnoreSpaces: event.target.checked })}
                />
                Ignorar espaços
              </label>
              <label className="operation-entry__checkbox">
                <input
                  type="checkbox"
                  checked={f.tokenIgnoreDashes}
                  onChange={(event) => updateFields({ tokenIgnoreDashes: event.target.checked })}
                />
                Ignorar "-"
              </label>
            </div>
          )}
        </div>

        <ValueSourceField
          label="Valor a procurar"
          placeholder="Introduza um valor"
          inputType="text"
          source={f.input}
          onChange={(input) => updateFields({ input })}
          referenceOptions={referenceOptions}
          resolvedInput={queryResolved}
        />

        <LookupResult
          datasetId={datasetId}
          query={query}
          sheetIndex={f.sheetIndex as number}
          searchColumn={searchColumn}
          resultColumn={f.resultColumn as number}
          startRow={startRow}
          matchMode={f.matchMode}
          tokenIgnoreSpaces={f.tokenIgnoreSpaces}
          tokenIgnoreDashes={f.tokenIgnoreDashes}
          testSignal={testSignal}
          resetSignal={resetSignal}
          onMatchChange={onMatchChange}
          onResultChange={onResultChange}
        />
      </>
    );
  },

  getColumnHighlights: (fields) => {
    const f = asLookupFields(fields);
    if (f.sheetIndex === '') {
      return [];
    }
    const highlights = [];
    if (f.searchColumn.type === 'literal' && f.searchColumn.value.trim() !== '' && Number.isInteger(Number(f.searchColumn.value))) {
      highlights.push({ sheetIndex: f.sheetIndex, column: Number(f.searchColumn.value), role: 'search' as const });
    }
    if (f.resultColumn !== '') {
      highlights.push({ sheetIndex: f.sheetIndex, column: f.resultColumn, role: 'result' as const, label: 'Saída' });
    }
    return highlights;
  },

  getCellHighlight: (fields, matchedRow) => {
    if (matchedRow === null) return null;
    const f = asLookupFields(fields);
    if (f.sheetIndex === '' || f.resultColumn === '') return null;
    // The result cell only ever needs the (always-fixed) resultColumn + the matched row, both
    // already known here — unlike the search cell below, it never depended on the search column
    // being a literal, so it used to get thrown away right along with the search cell whenever
    // the search column was dynamic instead, even though the result itself was matched just fine.
    const highlight: OperationHighlight = {
      resultSheetIndex: f.sheetIndex,
      resultColumn: f.resultColumn,
      rowIndex: matchedRow,
    };
    // Only a literal (fixed) search column has a known position without a live test result to
    // read it back from — a dynamic one just skips this paired search-cell highlight, leaving the
    // result cell above as the only thing marked (same as find, which has no fixed search column
    // at all).
    if (f.searchColumn.type === 'literal' && f.searchColumn.value.trim() !== '') {
      const searchColumn = Number(f.searchColumn.value);
      if (Number.isInteger(searchColumn)) {
        highlight.searchSheetIndex = f.sheetIndex;
        highlight.searchColumn = searchColumn;
      }
    }
    return highlight;
  },
};

interface LookupResultProps {
  datasetId: string;
  query: string;
  sheetIndex: number;
  /** Null while the (possibly chained) search column hasn't resolved to a valid index yet — same
   * "nothing to test" treatment as an empty query. */
  searchColumn: number | null;
  resultColumn: number;
  /** Null while the (possibly chained) start row hasn't resolved to a valid index yet — same
   * "nothing to test" treatment as an empty query or unresolved search column. */
  startRow: number | null;
  matchMode: LookupMatchMode;
  /** Only meaningful when matchMode is "tokenEquals" — see LookupMatchMode's own doc. */
  tokenIgnoreSpaces: boolean;
  tokenIgnoreDashes: boolean;
  /** Incremented by "Testar modelo" (see OperationPanel) — the only thing that triggers a
   * request; editing the query/table/columns afterward doesn't, until tested again. */
  testSignal: number;
  /** Incremented by "Limpar teste" — clears the shown result back to not-tested on demand. */
  resetSignal: number;
  onMatchChange: (rowIndex: number | null) => void;
  onResultChange: (value: string | null) => void;
}

type LookupRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; found: boolean; value: CellValue | null };

/**
 * Runs the operation entirely on the API: the dataset id (the API keeps the parsed dataset in
 * memory from the import call) plus the search/result table and column indexes are sent to
 * /api/v1/dataset/operation/lookup, which does the row matching and returns the value — this
 * component only renders the outcome, and only once "Testar modelo" is actually clicked: nothing
 * shows (see the 'idle' case below, rendering nothing) while the query/table/columns are still
 * being typed/changed (or, for a dynamic query or search column, not resolved yet), and no
 * request fires either — see the effect below. Always mounted (even with an empty/unresolved
 * query) rather than only once ready: mounting late — right as a dynamic query resolves mid
 * test-cycle — would otherwise hit React StrictMode's dev-only mount→cleanup→mount double-invoke
 * exactly when "Testar modelo" was clicked, firing two real requests for that one click (one
 * always discarded, but still an extra call) instead of the single request every other,
 * already-mounted operation makes.
 */
function LookupResult({
  datasetId,
  query,
  sheetIndex,
  searchColumn,
  resultColumn,
  startRow,
  matchMode,
  tokenIgnoreSpaces,
  tokenIgnoreDashes,
  testSignal,
  resetSignal,
  onMatchChange,
  onResultChange,
}: LookupResultProps) {
  const [state, setState] = useState<LookupRequestState>({ status: 'idle' });

  // Which testSignal we've already gotten a definitive response (success or error) for — starts
  // at 0, "never tested". A *dynamic* query or search column (chained from another operation's
  // result) can go from empty/unresolved to a real value right after "Testar modelo" is clicked,
  // once its upstream operation's own fetch resolves — that's still the same test round, so the
  // fetch below must still fire once it catches up, not be treated as a stale edit (a naive
  // "reset on any change" would otherwise silently swallow every chained lookup's result — the
  // change IS the test arriving, not the user editing something). Only a query/column change once
  // we've *already* gotten a response for the current testSignal is a genuine post-test edit,
  // which clears back to idle instead, waiting for the next "Testar modelo" click.
  const handledForSignalRef = useRef(0);

  // The in-flight request for the current testSignal, if one's already been started — reused
  // instead of starting a second one. React StrictMode runs mount → cleanup → mount again in dev;
  // both mounts execute synchronously back to back, well before either could see the other's
  // result, so a ref that only records "done" *after* the request resolves can't stop the second
  // mount from firing its own duplicate call in the meantime. Recording (and reusing) the in-flight
  // *promise itself*, synchronously, does: the second mount finds it already there and subscribes
  // to that same promise instead of calling lookupValue again, so only one real request ever goes
  // out no matter how many times the effect is (re)invoked for the same testSignal.
  const inFlightRef = useRef<{ signal: number; promise: ReturnType<typeof lookupValue> } | null>(null);

  // "Limpar teste": clears the shown result on demand, independent of any field changing. Also
  // resets handledForSignalRef/inFlightRef — "Limpar teste" resets every entry's own testSignal
  // counter back to 0 (see OperationPanel's cancelPendingTestStagger), so the *next* test's
  // testSignal can numerically collide with a value already recorded here from before the clear;
  // without this reset, that collision made the dedup check above mistake a genuinely new test for
  // an already-handled one and skip the fetch entirely — "it says it tested but the API wasn't
  // called" until a second click pushed the signal past the stale value.
  useEffect(() => {
    setState({ status: 'idle' });
    onMatchChange(null);
    onResultChange(null);
    handledForSignalRef.current = 0;
    inFlightRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (testSignal === 0 || query.trim() === '' || searchColumn === null || startRow === null) {
      return;
    }

    if (testSignal === handledForSignalRef.current) {
      setState({ status: 'idle' });
      onMatchChange(null);
      onResultChange(null);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const request =
      inFlightRef.current && inFlightRef.current.signal === testSignal
        ? inFlightRef.current.promise
        : (() => {
            const promise = lookupValue({
              datasetId,
              query,
              searchSheetIndex: sheetIndex,
              searchColumn,
              resultSheetIndex: sheetIndex,
              resultColumn,
              startRow,
              matchMode,
              tokenIgnoreSpaces,
              tokenIgnoreDashes,
            });
            inFlightRef.current = { signal: testSignal, promise };
            return promise;
          })();

    request
      .then((response) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'done', found: response.found, value: response.value });
          onMatchChange(response.found ? response.rowIndex : null);
          onResultChange(response.found ? String(response.value ?? '') : null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          handledForSignalRef.current = testSignal;
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao procurar o valor.' });
          onResultChange(null);
        }
      });

    return () => {
      cancelled = true;
      onMatchChange(null);
      onResultChange(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal, query, sheetIndex, searchColumn, resultColumn, startRow, matchMode, tokenIgnoreSpaces, tokenIgnoreDashes]);

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return <p className="operation-entry__result operation-entry__result--empty">A procurar…</p>;
  }

  if (state.status === 'error') {
    return <p className="operation-entry__result operation-entry__result--empty">{state.message}</p>;
  }

  if (!state.found) {
    return <p className="operation-entry__result operation-entry__result--empty">Sem correspondência encontrada.</p>;
  }

  const resultValue = formatCellValue(state.value ?? undefined);

  return (
    <p className="operation-entry__result">
      <span className="operation-entry__result-label">Saída:</span> {resultValue || '(vazio)'}
    </p>
  );
}
