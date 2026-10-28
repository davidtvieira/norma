package com.norma.dataset.library;

import java.time.Instant;
import java.util.UUID;

/**
 * A saved .nrm as the library lists it. {@code categoryId} is the category it is filed under (null for none). {@code available} is false when the row is there but its file is
 * missing from the storage folder, so the list can say so instead of failing.
 */
public record SavedNrmSummary(
        UUID id,
        String name,
        String datasetFilename,
        long sizeBytes,
        int operationCount,
        int inputCount,
        int outputCount,
        UUID categoryId,
        Instant createdAt,
        Instant updatedAt,
        boolean available) {
}
