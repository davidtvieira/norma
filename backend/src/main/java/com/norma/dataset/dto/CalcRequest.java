package com.norma.dataset.dto;

/**
 * Input for the calc operation: the already-resolved values to combine (any number, in order), the arithmetic operation
 * ({@code add}, {@code subtract}, {@code multiply} or {@code divide}) and how to format the result ({@code none}, {@code round}
 * for a rounded integer, or {@code abs} for the absolute value). A calc has no dataset dependency of its own.
 */
public record CalcRequest(java.util.List<String> values, String operation, String format) {
}
