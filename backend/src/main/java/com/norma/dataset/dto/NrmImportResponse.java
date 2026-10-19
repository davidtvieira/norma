package com.norma.dataset.dto;

/**
 * Returned by the .nrm import endpoint: the bundled dataset, parsed and stored exactly as a plain
 * dataset import would, plus the file's own {@link NrmInfo}.
 */
public record NrmImportResponse(DatasetImportResponse dataset, NrmInfo info) {
}
