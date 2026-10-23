/** The page selector's kind id — a model may have one, and it sets the page of every sheet-based operation. */
export const PAGE_SELECTOR_KIND_ID = 'page';

/** The kinds that read from a page of the dataset, and so automatically follow the model's page selector. */
export const PAGE_AWARE_KIND_IDS: ReadonlySet<string> = new Set(['lookup', 'sum', 'find']);

/**
 * The page a page selector's result stands for: its index when the result is a whole number, -1
 * while it has none (not tested yet, or invalid) — the sheet-based operations skip their request
 * for a negative page.
 */
export function pageSheetFromResult(result: string | null | undefined): number {
  const text = result?.trim() ?? '';
  return /^\d+$/.test(text) ? Number(text) : -1;
}
