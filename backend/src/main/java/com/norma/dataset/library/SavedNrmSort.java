package com.norma.dataset.library;

import org.springframework.data.domain.Sort;

import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * What the library can be ordered by — the {@code sort} parameter of GET /api/v1/library. Each value is the
 * parameter's spelling, the {@link SavedNrm} property it sorts on and the direction that reads naturally for it
 * when {@code direction} is left out (A to Z for the name, newest or biggest first for the rest).
 */
public enum SavedNrmSort {
    NAME("name", "name", Sort.Direction.ASC),
    UPDATED_AT("updatedAt", "updatedAt", Sort.Direction.DESC),
    CREATED_AT("createdAt", "createdAt", Sort.Direction.DESC),
    SIZE("sizeBytes", "sizeBytes", Sort.Direction.DESC),
    OPERATIONS("operationCount", "operationCount", Sort.Direction.DESC);

    private final String parameter;
    private final String property;
    private final Sort.Direction defaultDirection;

    SavedNrmSort(String parameter, String property, Sort.Direction defaultDirection) {
        this.parameter = parameter;
        this.property = property;
        this.defaultDirection = defaultDirection;
    }

    /** The value of the {@code sort} parameter; a missing one means most recently saved first. */
    public static SavedNrmSort fromParameter(String value) {
        if (value == null || value.isBlank()) {
            return UPDATED_AT;
        }
        return Arrays.stream(values())
                .filter(sort -> sort.parameter.equalsIgnoreCase(value.trim()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Unknown sort field. Use one of: "
                                + Arrays.stream(values()).map(sort -> sort.parameter).collect(Collectors.joining(", ")) + "."));
    }

    /** {@code asc} or {@code desc} (any case); a missing one means this field's natural direction. */
    public Sort.Direction directionFrom(String value) {
        if (value == null || value.isBlank()) {
            return defaultDirection;
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "asc" -> Sort.Direction.ASC;
            case "desc" -> Sort.Direction.DESC;
            default -> throw new IllegalArgumentException("Unknown direction. Use asc or desc.");
        };
    }

    /** The ordering, ties broken by id so the same request always lists the same way. */
    public Sort toSort(Sort.Direction direction) {
        return Sort.by(direction, property).and(Sort.by(Sort.Direction.ASC, "id"));
    }
}
