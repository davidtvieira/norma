package com.norma.dataset.dto;

import java.util.List;

/**
 * Result of a filter operation: the inputs that meet the condition, unchanged and in order (possibly none), and for each
 * one the position of the input it came from ({@code sources}, same length). The others are skipped, not errors.
 */
public record FilterResponse(List<String> values, List<Integer> sources) {
}
