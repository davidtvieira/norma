package com.norma.dataset.service;

import com.norma.dataset.dto.OperationType;

import java.util.List;

/**
 * The kinds of operation the API supports — the single list both the operations endpoint and
 * {@link NrmService}'s model validation read from, so a kind added in one place can't be rejected
 * by the other.
 */
public final class OperationTypes {

    public static final List<OperationType> ALL = List.of(
            new OperationType("lookup", "Lookup", true),
            new OperationType("sum", "Sum", true),
            new OperationType("counter", "Counter", false),
            new OperationType("node", "Node", false),
            new OperationType("find", "Find", true),
            new OperationType("translator", "Translator", false),
            new OperationType("selector", "Selector", false),
            new OperationType("iterator", "Iterator", true),
            new OperationType("calc", "Calc", false),
            new OperationType("page", "Page selector", true),
            new OperationType("formatter", "Input formatter", false)
    );

    private OperationTypes() {
    }

    /** Whether the kind reads from the dataset, so a model without one can't hold it (false for an unknown kind). */
    public static boolean requiresDataset(String id) {
        return ALL.stream().anyMatch(type -> type.id().equals(id) && type.requiresDataset());
    }

    public static boolean isKnown(String id) {
        return ALL.stream().anyMatch(type -> type.id().equals(id));
    }
}
