package com.norma.dataset.library;

import java.util.List;
import java.util.UUID;

/**
 * A category as GET /api/v1/library lists it: one entry of the folders found at that level (or, when searching
 * everywhere, anywhere). {@code path} is the names from the top-level category down to this one, itself last.
 * {@code normaCount} counts the normas filed directly in it, {@code totalCount} also those in all its subcategories,
 * and {@code childCount} is how many subcategories it has directly.
 */
public record FolderEntry(UUID id, UUID parentId, String name, List<String> path, int normaCount, int totalCount, int childCount) {
}
