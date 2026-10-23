package com.norma.dataset.dto;

/**
 * A part of the dataset a model run actually read, so the caller can show it. {@code shape} is
 * "column" (the whole column {@code startColumn} of the sheet), "range" (the rectangle given by
 * the four bounds) or "cell" (the single cell at {@code startRow}/{@code startColumn}).
 * {@code role} is "search" (where something was looked for or summed) or "result" (what was read
 * out); {@code label} optionally overrides the role's default legend text.
 */
public record DatasetTouch(
        int sheetIndex,
        String role,
        String shape,
        int startRow,
        int endRow,
        int startColumn,
        int endColumn,
        String label) {

    public static DatasetTouch column(int sheetIndex, String role, int column) {
        return new DatasetTouch(sheetIndex, role, "column", 0, 0, column, column, null);
    }

    public static DatasetTouch range(int sheetIndex, String role, int startRow, int endRow, int startColumn, int endColumn, String label) {
        return new DatasetTouch(sheetIndex, role, "range", startRow, endRow, startColumn, endColumn, label);
    }

    public static DatasetTouch cell(int sheetIndex, String role, int row, int column) {
        return new DatasetTouch(sheetIndex, role, "cell", row, row, column, column, null);
    }
}
