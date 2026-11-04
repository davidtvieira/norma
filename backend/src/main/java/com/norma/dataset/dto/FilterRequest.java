package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for the filter operation: the already-resolved values to check (any number, in order) and the condition that
 * decides which are kept. {@code mode} is {@code "single"} (the default: {@code operator} — eq, ne, contains,
 * startsWith, endsWith, gt, gte, lt or lte — against {@code value}) or {@code "range"} (numbers from {@code min} to
 * {@code max}, both inclusive, either blank for no limit). A filter has no dataset dependency.
 */
public record FilterRequest(String mode, String operator, String value, String min, String max, List<String> values) {
}
