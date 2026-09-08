import type { ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState } from '../../types/columnPick';
import type { ColumnHighlight, ConditionHighlight } from '../../types/highlight';

/**
 * A "kind" of condition (lookup, sum, ...) the panel can build. Each kind owns its own field
 * shape and knows how to render/validate itself; ConditionPanel only knows the generic entry
 * lifecycle (name, draft/confirmed, edit/cancel, hover) and delegates everything type-specific
 * here. Fields are untyped at this boundary — each kind casts to its own shape internally.
 */

export type ConditionFields = Record<string, unknown>;

export interface ConditionDraftContext {
  dataset: DatasetImportResponse;
  entryId: string;
  fields: ConditionFields;
  updateFields: (patch: ConditionFields) => void;
  searching: boolean;
  startSearching: () => void;
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
}

export interface ConditionBodyContext {
  fields: ConditionFields;
  updateFields: (patch: ConditionFields) => void;
  datasetId: string;
  onMatchChange: (rowIndex: number | null) => void;
}

export interface ConditionKind {
  /** Matches an id from GET /api/v1/dataset/operations. */
  id: string;
  createFields: () => ConditionFields;
  canConfirm: (fields: ConditionFields) => boolean;
  /** The table/column pickers etc. shown while building or editing. */
  renderDraftConfig: (ctx: ConditionDraftContext) => ReactNode;
  /** The one-line summary shown on the confirmed card. */
  renderSummary: (fields: ConditionFields, dataset: DatasetImportResponse) => ReactNode;
  /** The value input + live result shown on the confirmed card. */
  renderBody: (ctx: ConditionBodyContext) => ReactNode;
  /** Whole-column tints this condition's fields currently point at. */
  getColumnHighlights: (fields: ConditionFields) => ColumnHighlight[];
  /** Exact input/output cell for the current match, if this kind supports that precision. */
  getCellHighlight?: (fields: ConditionFields, matchedRow: number | null) => ConditionHighlight | null;
}
