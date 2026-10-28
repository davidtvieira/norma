package com.norma.dataset.library;

import java.util.List;
import java.util.UUID;

/**
 * A category as GET /api/v1/categories lists it, with its subcategories (nested, up to 4 levels). {@code normaCount} counts the normas filed
 * directly under it; {@code totalCount} also counts those in all its subcategories (what filtering by it lists).
 */
public record CategoryNode(UUID id, UUID parentId, String name, int normaCount, int totalCount, List<CategoryNode> children) {
}
