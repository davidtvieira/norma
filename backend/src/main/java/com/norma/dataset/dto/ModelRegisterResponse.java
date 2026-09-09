package com.norma.dataset.dto;

/**
 * A registered model's id, used to run it later via
 * POST /api/v1/dataset/{datasetId}/model/{modelId}/run.
 */
public record ModelRegisterResponse(String modelId) {
}
