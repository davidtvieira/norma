package com.norma.dataset.library;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One row of the library of saved .nrm files: what is needed to list a file and to find it again. The file
 * itself is kept by {@link NrmFileStorage} under the same id.
 */
@Entity
@Table(name = "nrm")
public class SavedNrm {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "dataset_filename", nullable = false)
    private String datasetFilename;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "operation_count", nullable = false)
    private int operationCount;

    @Column(name = "input_count", nullable = false)
    private int inputCount;

    @Column(name = "output_count", nullable = false)
    private int outputCount;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SavedNrm() {
        // for JPA
    }

    public SavedNrm(UUID id, Instant now) {
        this.id = id;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDatasetFilename() {
        return datasetFilename;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public int getOperationCount() {
        return operationCount;
    }

    public int getInputCount() {
        return inputCount;
    }

    public int getOutputCount() {
        return outputCount;
    }

    /** The category the norma is filed under, or null for none. */
    public UUID getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(UUID categoryId) {
        this.categoryId = categoryId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** The name the entry is listed under, apart from the name the file carries inside. */
    public void rename(String name) {
        this.name = name;
    }

    /** Takes over everything the file says about itself, as saved or replaced at {@code now}. */
    public void describe(String name, String datasetFilename, long sizeBytes, String sha256,
                         int operationCount, int inputCount, int outputCount, Instant now) {
        this.name = name;
        this.datasetFilename = datasetFilename;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.operationCount = operationCount;
        this.inputCount = inputCount;
        this.outputCount = outputCount;
        this.updatedAt = now;
    }
}
