package com.norma.dataset.dto;

/**
 * Input for the calc operation: the already-resolved values (any number in {@code values}, or just {@code a} and {@code b}), the arithmetic operation
 * ({@code add}, {@code subtract}, {@code multiply} or {@code divide}) and how to format the result
 * ({@code none}, {@code round} for a rounded integer, or {@code abs} for the absolute value). Like
 * counter, calc has no dataset dependency of its own.
 */
public record CalcRequest(String a, String b, String operation, String format, java.util.List<String> values) {

    /** The two-value form, for a calc made with just "a" and "b". */
    public CalcRequest(String a, String b, String operation, String format) {
        this(a, b, operation, format, null);
    }
}
