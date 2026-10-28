package com.norma.dataset.dto;

import java.math.BigDecimal;

/**
 * The rules of a formatter operation: what kind of value an input may hold and its limits. {@code type} is "text" (the
 * default), "integer" or "decimal"; {@code required} refuses an empty value; {@code minLength}/{@code maxLength} count
 * the characters of a text; {@code min}/{@code max} bound an integer or a decimal. Any limit may be null (no limit).
 * A formatter does not change the value it accepts beyond writing a number canonically ("007" becomes "7").
 */
public record ValueFormat(String type, Boolean required, Integer minLength, Integer maxLength, BigDecimal min, BigDecimal max) {
}
