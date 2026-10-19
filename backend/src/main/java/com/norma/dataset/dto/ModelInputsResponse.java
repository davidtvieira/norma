package com.norma.dataset.dto;

import java.util.List;

/**
 * What a caller utilizing a registered model needs before running it — just the inputs to fill in —
 * and nothing about the operations behind them, nor its outputs, which only come back
 * with a run. Returned by GET /api/v1/model/{modelId}/inputs.
 */
public record ModelInputsResponse(List<ModelInputField> inputs) {
}
