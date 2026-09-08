package com.norma.dataset.dto;

/**
 * Result of a lookup operation: whether a matching row was found in the search table, the
 * value read from the result column of the corresponding row, and that row's index (the same
 * in both the search and result sheets, since they're matched by row index) — null when
 * nothing matched — so callers can highlight the exact matched cells, not just the columns.
 */
public record LookupResponse(boolean found, Object value, Integer rowIndex) {
}
