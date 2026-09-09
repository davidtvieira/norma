package com.norma.dataset.dto;

/**
 * Runs a previously registered model: {@code inputValue} replaces the literal value of the
 * model's designated input operation for this run (null/omitted when the model has no input,
 * i.e. its registration didn't set an inputOperationId). The operations themselves — every
 * table/column/range detail — stay server-side, registered once; a run only ever sends the one
 * value a caller is actually meant to supply.
 */
public record ModelRunRequest(String inputValue) {
}
