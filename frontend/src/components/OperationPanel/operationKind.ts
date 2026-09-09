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
  fields: OperationFields;
  updateFields: (patch: OperationFields) => void;
  datasetId: string;
  onMatchChange: (rowIndex: number | null) => void;
  /** The operation's chainable input ("query", ...) resolved to a literal value, for kinds that have one. */
  resolvedInput: ResolvedInput;
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
  /** Exact input/output cell for the current match, if this kind supports that precision. */
  getCellHighlight?: (fields: OperationFields, matchedRow: number | null) => OperationHighlight | null;
}
