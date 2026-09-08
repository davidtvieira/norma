package com.norma.dataset.dto;

import java.time.Instant;
import java.util.List;

/**
 * Top-level response returned by the dataset import endpoint. {@code datasetId} is the
 * handle later operation requests use to reference this dataset instead of resending it.
 */
public record DatasetImportResponse(String datasetId, String filename, Instant uploadedAt, List<SheetData> sheets) {
}
