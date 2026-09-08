import type { ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight } from '../../types/highlight';
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
}

export interface OperationBodyContext {
  fields: OperationFields;
  updateFields: (patch: OperationFields) => void;
  datasetId: string;
  onMatchChange: (rowIndex: number | null) => void;
  /** The operation's chainable input ("query", "start row", ...) resolved to a literal value. */
  resolvedInput: ResolvedInput;
  /** Other confirmed operations the input field's reference picker can offer. */
  referenceOptions: ReferenceOption[];
  /** Reports this operation's own result so a later operation can reference it; null clears it. */
  onResultChange: (value: string | null) => void;
}

export interface OperationKind {
  /** Matches an id from GET /api/v1/dataset/operations. */
  id: string;
  /** Starting fields for a new entry — given the dataset so a lone table can be pre-selected. */
  createFields: (dataset: DatasetImportResponse) => OperationFields;
  canConfirm: (fields: OperationFields) => boolean;
  /** The table/column pickers etc. shown while building or editing. */
  renderDraftConfig: (ctx: OperationDraftContext) => ReactNode;
  /** The one-line summary shown on the confirmed card. */
  renderSummary: (fields: OperationFields, dataset: DatasetImportResponse) => ReactNode;
  /** The value input + live result shown on the confirmed card. */
  renderBody: (ctx: OperationBodyContext) => ReactNode;
  /** Whole-column tints this operation's fields currently point at. */
  getColumnHighlights: (fields: OperationFields) => ColumnHighlight[];
  /** Exact input/output cell for the current match, if this kind supports that precision. */
  getCellHighlight?: (fields: OperationFields, matchedRow: number | null) => OperationHighlight | null;
}
