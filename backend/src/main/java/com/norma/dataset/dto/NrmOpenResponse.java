package com.norma.dataset.dto;

import java.time.Instant;

/**
 * What opening a saved .nrm returns: the {@code nrmId} every later request about it uses, plus what the screen
 * shows about it, so the browser needs no copy of the file: its name, when the saved entry was created (its own date,
 * which a replace keeps), the model's own name, the dataset's file name and when the entry was last updated.
 */
public record NrmOpenResponse(String status, String nrmId, String name, Instant createdAt, String modelName,
                              String datasetFilename, Instant updatedAt) {
}
