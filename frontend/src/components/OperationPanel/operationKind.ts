import type { ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import type { ResolvedInput } from '../../utils/resolveOperationInputs';

/** An other confirmed operation the "input" field can point at instead of a typed value. */
export interface ReferenceOption {
  operationId: string;
  label: string;
}

/**
 * A "kind" of operation (lookup, sum, ...) the panel can build. Each kind owns its own field
 * shape and knows how to render/validate itself; OperationPanel only knows the generic entry
 * lifecycle (name, draft/confirmed, edit/cancel, hover) and delegates everything type-specific
 * here. Fields are untyped at this boundary — each kind casts to its own shape internally.
 */

export type OperationFields = Record<string, unknown>;

export interface OperationDraftContext {
  dataset: DatasetImportResponse;
  entryId: string;
  fields: OperationFields;
  updateFields: (patch: OperationFields) => void;
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  rangePick: RangePickState | null;
  onStartRangePick: (entryId: string, sheetIndex: number) => void;
  onFinishRangePick: () => void;
}

export interface OperationBodyContext {
  entryId: string;
  fields: OperationFields;
  updateFields: (patch: OperationFields) => void;
  datasetId: string;
  /** Column-pick state/controls (see ColumnPickerField in fields.tsx) — threaded through so a
   * chainable field's ValueSourceField can offer "pick a column from the sheet" as a third source
   * alongside static/dynamic (see its own `columnPicker` prop), the same click-a-header flow
   * ColumnPickerField already gives a kind's fixed, non-chainable column fields (e.g. lookup's own
   * resultColumn, picked in renderDraftConfig instead). Starting a pick from here closes this
   * card's own detail modal (see OperationPanel's renderConfirmedCard) so the sheet panel — which
   * a modal's full-screen overlay would otherwise sit on top of — is actually clickable. */
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  /** columnIndex is only meaningful for a kind whose match isn't at any single fixed column (e.g.
   * find, scanning a whole range) — lookup's own fixed result column makes it redundant there, so
   * it's optional and lookup's own call site omits it. */
  onMatchChange: (rowIndex: number | null, columnIndex?: number | null) => void;
  /** The operation's chainable input ("query", ...) resolved to a literal value, for kinds that
   * have exactly one. Always resolvedInputs[0] — kept alongside it so a single-input kind (e.g.
   * lookup) doesn't need to index into an array for the one value it actually has. */
  resolvedInput: ResolvedInput;
  /** Every one of the operation's chainable inputs, resolved in field order — for a kind with
   * several (e.g. counter's "inputs" list) rather than just one. */
  resolvedInputs: ResolvedInput[];
  /** Other confirmed operations the input field's reference picker can offer. */
  referenceOptions: ReferenceOption[];
  /** Reports this operation's own result so a later operation can reference it; null clears it. */
  onResultChange: (value: string | null) => void;
  /**
   * Incremented by "Testar modelo" (see OperationPanel) — the one thing that should make a kind's
   * result component actually call its endpoint. Configuring the operation further (typing a
   * literal value, picking a different column/range, ...) must not call it on its own; only
   * another test does, so the API isn't hit continuously while the model is still being built.
   */
  testSignal: number;
  /** Incremented by "Limpar teste" (see OperationPanel) — clears whatever this kind's result
   * component last showed (back to not-tested) without waiting for a field to change. */
  resetSignal: number;
}

export interface OperationInputEditorContext {
  fields: OperationFields;
  updateFields: (patch: OperationFields) => void;
  /** The operation's chainable input resolved to a literal value — drives the reference pill's status text. */
  resolvedInput: ResolvedInput;
}

export interface OperationKind {
  /** Matches an id from GET /api/v1/dataset/operations. */
  id: string;
  /** Starting fields for a new entry — given the dataset so a lone table can be pre-selected. */
  createFields: (dataset: DatasetImportResponse) => OperationFields;
  canConfirm: (fields: OperationFields) => boolean;
  /** The table/range/column pickers etc. shown while building or editing. */
  renderDraftConfig: (ctx: OperationDraftContext) => ReactNode;
  /** The one-line "which table/columns/range" detail shown at the bottom of the confirmed card
   * (see OperationPanel's ConfirmedOperationCard footer). */
  renderSummary: (fields: OperationFields, dataset: DatasetImportResponse) => ReactNode;
  /** The value input + live result shown on the confirmed card. */
  renderBody: (ctx: OperationBodyContext) => ReactNode;
  /**
   * The editable literal-input control alone, with no fetching/result of its own — used by
   * ModelCard (utilizing an already-built model) where the model's shape is fixed and only its
   * literal inputs remain editable; the result itself comes from a single batched
   * /model/calculate call instead of each kind fetching its own. Undefined for kinds with no
   * chainable input (e.g. sum, whose range is picked once and baked into the model).
   */
  renderInputEditor?: (ctx: OperationInputEditorContext) => ReactNode;
  /** Whole-column tints this operation's fields currently point at. */
  getColumnHighlights: (fields: OperationFields) => ColumnHighlight[];
  /** Rectangular range tints this operation's fields currently point at. */
  getRangeHighlights?: (fields: OperationFields) => RangeHighlight[];
  /** Exact input/output cell for the current match, if this kind supports that precision.
   * matchedColumn is only ever populated for (and only needs reading by) a kind whose match isn't
   * at a fixed column — see onMatchChange's own note above. */
  getCellHighlight?: (
    fields: OperationFields,
    matchedRow: number | null,
    matchedColumn?: number | null,
  ) => OperationHighlight | null;
}
