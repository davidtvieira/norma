package com.norma.dataset.dto;

/**
 * Result of a find operation: unlike lookup (which reads a value from a different column of the
 * matched row), find reports the position of the match itself within the searched range — the
 * first cell (scanning row by row, then column by column within each row) whose value matches
 * the query. Both indices are null when nothing in the range matches.
 */
public record FindResponse(boolean found, Integer rowIndex, Integer columnIndex) {
}
