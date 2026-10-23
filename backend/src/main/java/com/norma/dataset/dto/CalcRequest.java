package com.norma.dataset.dto;

/**
 * Input for the calc operation: the two already-resolved values, the arithmetic operation
 * ({@code add}, {@code subtract}, {@code multiply} or {@code divide}) and how to format the result
 * ({@code none}, {@code round} for a rounded integer, or {@code abs} for the absolute value). Like
 * counter, calc has no dataset dependency of its own.
 */
public record CalcRequest(String a, String b, String operation, String format) {
}
