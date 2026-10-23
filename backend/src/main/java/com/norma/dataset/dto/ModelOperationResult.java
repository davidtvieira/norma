package com.norma.dataset.dto;

import java.util.List;

/**
 * One operation's outcome from a model calculation: its own single output value (a lookup's
 * found value, or a sum's total) when {@code success} is true, or {@code error} describing why
 * it couldn't be computed (unknown kind, a broken/circular reference, a bad range, ...) — one
 * operation failing doesn't stop the others in the same request from being computed.
 * {@code name} is the operation's display name, only filled in on a model run's designated
 * outputs (so the caller learns an output's label together with its result). {@code touches}
 * is only filled in on a model run's designated outputs: every part of the dataset the output's
 * whole chain of operations read.
 */
public record ModelOperationResult(
        String id, boolean success, Object value, String error, String name, List<DatasetTouch> touches) {

    public ModelOperationResult(String id, boolean success, Object value, String error) {
        this(id, success, value, error, null, null);
    }

    public ModelOperationResult(String id, boolean success, Object value, String error, String name) {
        this(id, success, value, error, name, null);
    }

    public ModelOperationResult withName(String name) {
        return new ModelOperationResult(id, success, value, error, name, touches);
    }

    /** The parts of the dataset this operation read (only lookup, sum and find read any). */
    public ModelOperationResult withTouches(List<DatasetTouch> touches) {
        return new ModelOperationResult(id, success, value, error, name, touches);
    }
}
