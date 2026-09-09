package com.norma.dataset.dto;

/**
 * Result of a node operation: the same value it was given — a node is a pass-through, not a
 * computation.
 */
public record NodeResponse(String value) {
}
