package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for registering a model against a previously imported dataset: every operation's kind
 * and fields (the same shape the frontend already builds and exports — see
 * frontend/src/utils/modelSerialization.ts), plus which operation is the model's designated
 * input (nullable — a model with nothing literal left for a caller to fill in has none) and
 * which is its output. The dataset id itself comes from the URL path, not the body. Registering
 * returns a model id (see ModelRegisterResponse) a caller then runs repeatedly via
 * POST /api/v1/dataset/{datasetId}/model/{modelId}/run without resending the operations
 * themselves on every run.
 */
public record ModelRegisterRequest(
        String name,
        List<ModelOperationInput> operations,
        String inputOperationId,
        String outputOperationId) {
}
