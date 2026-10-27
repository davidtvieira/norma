package com.norma.dataset.dto;

import java.time.Instant;

/**
 * What opening a saved .nrm returns: the {@code nrmId} every later request about it uses, plus what the screen
 * shows about it, so the browser needs no copy of the file — the name and creation date from its info.json, the
 * model's own name and the dataset's file name.
 */
public record NrmOpenResponse(String status, String nrmId, String name, Instant createdAt, String modelName,
                              String datasetFilename) {
}
