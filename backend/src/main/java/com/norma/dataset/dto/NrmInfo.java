package com.norma.dataset.dto;

import java.time.Instant;

/**
 * The {@code info.json} stored inside a .nrm file: metadata about the file itself, as opposed to
 * the model or dataset it bundles. New fields go here as the format grows. {@code description} is what the author wrote
 * about the norma (optional, null when there is none).
 */
public record NrmInfo(String name, Instant createdAt, String description) {

    /** An info with no description. */
    public NrmInfo(String name, Instant createdAt) {
        this(name, createdAt, null);
    }
}
