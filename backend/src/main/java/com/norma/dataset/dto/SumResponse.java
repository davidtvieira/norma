package com.norma.dataset.dto;

/**
 * Result of a sum operation: the total and how many rows (from startRow onward) actually held
 * a numeric value and were counted — non-numeric or blank cells are skipped, not treated as 0.
 */
public record SumResponse(double sum, int rowsSummed) {
}
