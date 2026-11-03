package com.norma.dataset.legacy;

import java.util.List;

/**
 * TEMPORARY: what happened to one saved norma. {@code status} is {@code converted} (verified and saved), {@code verified}
 * (a dry run: it would convert and every test case matched), {@code unchanged} (nothing to convert) or {@code failed}
 * ({@code problems} says why, and the norma is as it was).
 */
public record ConversionReport(
        String id, String name, String status, int counters, int calcs, int cases, List<String> problems) {
}
