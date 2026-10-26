package com.norma.dataset.dto;

import java.util.List;

/**
 * What a model run returns: {@code results} are the designated outputs, exactly as before;
 * {@code watched} are the operations the caller asked to see on top of that (see
 * {@link ModelRunRequest#watchIds()}), in the order requested — one per round when the model has
 * an iterator.
 */
public record ModelRunResponse(List<ModelOperationResult> results, List<ModelOperationResult> watched) {
}
