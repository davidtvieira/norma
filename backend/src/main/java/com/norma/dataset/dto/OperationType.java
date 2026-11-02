package com.norma.dataset.dto;

/**
 * Describes one kind of data operation the frontend can build a condition against
 * (e.g. the "lookup" operation backing {@code /api/v1/dataset/operation/lookup}).
 * {@code requiresDataset} says whether the kind reads from the dataset (its sheets, columns or ranges): a model
 * without a dataset can only hold the kinds that don't.
 */
public record OperationType(String id, String label, boolean requiresDataset) {
}
