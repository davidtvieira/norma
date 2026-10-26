package com.norma.dataset.dto;

import java.util.List;

/**
 * What a caller utilizing a registered model needs before running it — the inputs to fill in, and
 * the id/name/kind of every operation so it can pick some to watch — and nothing about how the
 * operations are configured, nor its outputs, which only come back with a run. Returned by GET
 * /api/v1/model/{modelId}/inputs.
 */
public record ModelInputsResponse(List<ModelInputField> inputs, List<ModelOperationRef> operations) {
}
