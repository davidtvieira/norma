package com.norma.dataset.library;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/categories")
@Tag(name = "Categories", description = "The categories (and their subcategories) the saved .nrm files are filed under.")
public class CategoryController {

    private final CategoryService categories;

    public CategoryController(CategoryService categories) {
        this.categories = categories;
    }

    @Operation(summary = "List the categories as a tree",
            description = "Top-level categories by name, each with its subcategories. normaCount counts the normas "
                    + "filed directly under a category, totalCount also those in its subcategories.")
    @GetMapping
    public List<CategoryNode> tree() {
        return categories.tree();
    }

    @Operation(summary = "Create a category",
            description = "With a parentId it is a subcategory of that category. Categories go 4 levels deep (a "
                    + "category, a subcategory, a subcategory of that, and one more): going deeper is a 400. A name is "
                    + "unique among its siblings (any case): a repeated one is a 409.")
    @PostMapping
    public ResponseEntity<CategoryNode> create(@RequestBody CategoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categories.create(request));
    }

    @Operation(summary = "Rename or move a category",
            description = "Takes the whole category: its name and its parentId (null = top level). It moves with "
                    + "everything under it, which must still fit in 4 levels; it cannot go under itself or its own "
                    + "subcategories.")
    @PutMapping("/{id}")
    public CategoryNode update(@PathVariable UUID id, @RequestBody CategoryRequest request) {
        return categories.update(id, request);
    }

    @Operation(summary = "Delete a category",
            description = "Refused with a 409 while it still has subcategories or normas.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        categories.delete(id);
        return ResponseEntity.noContent().build();
    }
}
