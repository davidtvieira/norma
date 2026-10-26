package com.norma.dataset.dto;

import java.util.List;

/**
 * A registered model's id, used to run it later via
 * POST /api/v1/dataset/{datasetId}/model/{modelId}/run, together with its designated inputs (the
 * same list GET /api/v1/model/{modelId}/inputs returns) so a caller registering a model doesn't
 * need a second request to learn what to fill in.
 */
public record ModelRegisterResponse(String modelId, List<ModelInputField> inputs, List<ModelOperationRef> operations) {
}
