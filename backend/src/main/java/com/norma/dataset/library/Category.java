package com.norma.dataset.library;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A category the saved normas are filed under; a top-level one has no parent, a subcategory has one. */
@Entity
@Table(name = "category")
public class Category {

    @Id
    private UUID id;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false)
    private String name;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Category() {
        // for JPA
    }

    public Category(UUID id, UUID parentId, String name, Instant now) {
        this.id = id;
        this.parentId = parentId;
        this.name = name;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getParentId() {
        return parentId;
    }

    public String getName() {
        return name;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(UUID parentId, String name, Instant now) {
        this.parentId = parentId;
        this.name = name;
        this.updatedAt = now;
    }
}
