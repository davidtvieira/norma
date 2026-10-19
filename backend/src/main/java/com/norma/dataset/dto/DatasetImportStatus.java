package com.norma.dataset.dto;

/**
 * What the import endpoints return: only that the import went through and the {@code datasetId}
 * every later request uses to reference the dataset. The parsed sheets are not part of it — they
 * are read on demand with GET /api/v1/dataset/{datasetId}, by the one screen that displays them.
 */
public record DatasetImportStatus(String status, String datasetId) {

    public static final String SUCCESS = "success";

    public static DatasetImportStatus success(String datasetId) {
        return new DatasetImportStatus(SUCCESS, datasetId);
    }
}
