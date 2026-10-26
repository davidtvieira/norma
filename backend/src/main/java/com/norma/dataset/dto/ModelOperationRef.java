package com.norma.dataset.dto;

/**
 * One operation of a registered model as a caller can pick it to watch (see
 * {@link ModelRunRequest#watchIds()}): only its id, display name and kind — never its configuration.
 */
public record ModelOperationRef(String id, String name, String kind) {
}
