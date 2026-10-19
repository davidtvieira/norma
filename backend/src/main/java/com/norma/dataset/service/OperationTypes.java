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
            new OperationType("lookup", "Lookup"),
            new OperationType("sum", "Sum"),
            new OperationType("counter", "Counter"),
            new OperationType("node", "Node"),
            new OperationType("find", "Find"),
            new OperationType("translator", "Translator")
    );

    private OperationTypes() {
    }

    public static boolean isKnown(String id) {
        return ALL.stream().anyMatch(type -> type.id().equals(id));
    }
}
