package com.norma.dataset.library;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The categories saved normas are filed under: a category and its subcategories, {@value #MAX_DEPTH} levels at most
 * (a category, its subcategory, and so on). A name is unique among its siblings (any case), and a category with
 * subcategories or normas in it cannot be deleted.
 */
@Service
public class CategoryService {

    /** How many levels deep categories go: a top-level category is level 1. */
    static final int MAX_DEPTH = 4;

    static final int MAX_NAME_LENGTH = 255;

    private final CategoryRepository categories;
    private final SavedNrmRepository normas;

    public CategoryService(CategoryRepository categories, SavedNrmRepository normas) {
        this.categories = categories;
        this.normas = normas;
    }

    /** The top-level categories by name, each with its subcategories (to any depth, by name) and the counts of normas. */
    @Transactional(readOnly = true)
    public List<CategoryNode> tree() {
        Map<UUID, Integer> own = new HashMap<>();
        for (SavedNrmRepository.CategoryCount count : normas.countByCategory()) {
            own.put(count.getCategoryId(), (int) count.getTotal());
        }
        Map<UUID, List<Category>> childrenOf = childrenByParent(categories.findAll());
        return childrenOf.getOrDefault(null, List.of()).stream().sorted(BY_NAME)
                .map(root -> nodeOf(root, childrenOf, own)).toList();
    }

    private static CategoryNode nodeOf(Category category, Map<UUID, List<Category>> childrenOf, Map<UUID, Integer> own) {
        List<CategoryNode> children = childrenOf.getOrDefault(category.getId(), List.of()).stream().sorted(BY_NAME)
                .map(child -> nodeOf(child, childrenOf, own)).toList();
        int count = own.getOrDefault(category.getId(), 0);
        int total = count + children.stream().mapToInt(CategoryNode::totalCount).sum();
        return new CategoryNode(category.getId(), category.getParentId(), category.getName(), count, total, children);
    }

    /** The categories grouped by parent id (the top-level ones under the null key). */
    private static Map<UUID, List<Category>> childrenByParent(List<Category> all) {
        Map<UUID, List<Category>> childrenOf = new HashMap<>();
        for (Category category : all) {
            childrenOf.computeIfAbsent(category.getParentId(), key -> new ArrayList<>()).add(category);
        }
        return childrenOf;
    }

    @Transactional
    public CategoryNode create(CategoryRequest request) {
        String name = cleanName(request.name());
        requireDepthFits(request.parentId(), null);
        requireFreeName(request.parentId(), name, null);
        Category saved = categories.saveAndFlush(new Category(UUID.randomUUID(), request.parentId(), name, now()));
        return nodeOf(saved);
    }

    /** Renames a category and/or moves it (with everything under it) under another category, or to the top level. */
    @Transactional
    public CategoryNode update(UUID id, CategoryRequest request) {
        Category category = find(id);
        String name = cleanName(request.name());
        UUID parentId = request.parentId();
        requireDepthFits(parentId, id);
        requireFreeName(parentId, name, id);
        category.update(parentId, name, now());
        return nodeOf(categories.saveAndFlush(category));
    }

    @Transactional
    public void delete(UUID id) {
        Category category = find(id);
        if (categories.existsByParentId(id)) {
            throw new CategoryConflictException("The category still has subcategories. Delete or move them first.");
        }
        if (normas.existsByCategoryId(id)) {
            throw new CategoryConflictException("The category still has normas. Move them to another category first.");
        }
        categories.delete(category);
    }

    /** The ids a filter by {@code id} covers: the category itself and all its subcategories, at any depth. */
    @Transactional(readOnly = true)
    public List<UUID> idsWithin(UUID id) {
        find(id);
        Map<UUID, List<Category>> childrenOf = childrenByParent(categories.findAll());
        List<UUID> ids = new ArrayList<>();
        ids.add(id);
        for (int next = 0; next < ids.size(); next++) {
            childrenOf.getOrDefault(ids.get(next), List.of()).forEach(child -> ids.add(child.getId()));
        }
        return ids;
    }

    /** Fails with a 404 unless a category with this id exists. */
    void requireExists(UUID id) {
        find(id);
    }

    private static final Comparator<Category> BY_NAME =
            Comparator.comparing((Category category) -> category.getName().toLowerCase(Locale.ROOT))
                    .thenComparing(Category::getId);

    private CategoryNode nodeOf(Category category) {
        int count = (int) normas.countByCategoryId(category.getId());
        return new CategoryNode(category.getId(), category.getParentId(), category.getName(), count, count, List.of());
    }

    private Category find(UUID id) {
        return categories.findById(id).orElseThrow(() -> new CategoryNotFoundException("Category not found."));
    }

    /**
     * Fails unless a category can go under {@code parentId} (null = top level) without leaving the allowed depth. When
     * {@code moving} is given it is the category being moved: it can't go under itself or one of its own subcategories,
     * and everything under it has to fit too.
     */
    private void requireDepthFits(UUID parentId, UUID moving) {
        Map<UUID, Category> byId = new HashMap<>();
        Map<UUID, List<Category>> childrenOf = new HashMap<>();
        for (Category category : categories.findAll()) {
            byId.put(category.getId(), category);
            childrenOf.computeIfAbsent(category.getParentId(), key -> new ArrayList<>()).add(category);
        }
        int parentDepth = 0;
        for (UUID ancestor = parentId; ancestor != null; ancestor = byId.get(ancestor).getParentId()) {
            if (!byId.containsKey(ancestor)) {
                throw new CategoryNotFoundException("Category not found.");
            }
            if (ancestor.equals(moving)) {
                throw new IllegalArgumentException("A category cannot go under itself or one of its own subcategories.");
            }
            parentDepth++;
        }
        int levels = moving == null ? 1 : heightOf(moving, childrenOf);
        if (parentDepth + levels > MAX_DEPTH) {
            throw new IllegalArgumentException("Categories go " + MAX_DEPTH + " levels deep: this would be too deep.");
        }
    }

    /** How many levels a category's own subtree has, itself included (a category with no subcategories is 1). */
    private static int heightOf(UUID id, Map<UUID, List<Category>> childrenOf) {
        int deepest = 0;
        for (Category child : childrenOf.getOrDefault(id, List.of())) {
            deepest = Math.max(deepest, heightOf(child.getId(), childrenOf));
        }
        return deepest + 1;
    }

    private void requireFreeName(UUID parentId, String name, UUID ignoring) {
        boolean taken = categories.findAll().stream()
                .filter(other -> java.util.Objects.equals(other.getParentId(), parentId))
                .filter(other -> !other.getId().equals(ignoring))
                .anyMatch(other -> other.getName().equalsIgnoreCase(name));
        if (taken) {
            throw new CategoryConflictException("There is already a category with this name here.");
        }
    }

    private static String cleanName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("The category needs a name.");
        }
        String cleaned = name.trim();
        if (cleaned.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("The category name is too long (at most " + MAX_NAME_LENGTH + " characters).");
        }
        return cleaned;
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}
