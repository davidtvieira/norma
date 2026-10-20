package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for the selector operation: the already-resolved zero-based {@code index} and the
 * already-resolved {@code values} to pick from, in order. Like counter, a selector has no dataset
 * dependency — each of these was itself either typed directly or (from the editor's perspective)
 * chained from another operation's already-computed result.
 */
public record SelectorRequest(String index, List<String> values) {
}
