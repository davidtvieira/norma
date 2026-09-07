package com.norma.dataset.dto;

import java.time.Instant;
import java.util.List;

/**
 * Top-level response returned by the dataset import endpoint.
 */
public record DatasetImportResponse(String filename, Instant uploadedAt, List<SheetData> sheets) {
}
