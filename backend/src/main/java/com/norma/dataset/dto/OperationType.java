package com.norma.dataset.dto;

/**
 * Describes one kind of data operation the frontend can build a condition against
 * (e.g. the "lookup" operation backing {@code /api/v1/dataset/operation/lookup}).
 */
public record OperationType(String id, String label) {
}
