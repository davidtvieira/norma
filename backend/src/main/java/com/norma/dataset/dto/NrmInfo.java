package com.norma.dataset.dto;

import java.time.Instant;

/**
 * The {@code info.json} stored inside a .nrm file: metadata about the file itself, as opposed to
 * the model or dataset it bundles. New fields go here as the format grows.
 */
public record NrmInfo(int version, String name, Instant createdAt) {
}
