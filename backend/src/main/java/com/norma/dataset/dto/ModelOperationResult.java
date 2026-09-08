package com.norma.dataset.dto;

/**
 * One operation's outcome from a model calculation: its own single output value (a lookup's
 * found value, or a sum's total) when {@code success} is true, or {@code error} describing why
 * it couldn't be computed (unknown kind, a broken/circular reference, a bad range, ...) — one
 * operation failing doesn't stop the others in the same request from being computed.
 */
public record ModelOperationResult(String id, boolean success, Object value, String error) {
}
