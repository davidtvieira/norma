package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for registering a model against a previously imported dataset: every operation's kind
 * and fields (the same shape the frontend already builds and exports — see
 * frontend/src/utils/modelSerialization.ts), plus which operations are the model's designated
 * inputs (possibly empty — a model with nothing literal left for a caller to fill in has none;
 * a model can also have several, each filled in separately by a caller) and which are its
 * designated outputs (at least one required — a model always computes something; it can also
 * have several, each returned separately by a run). The dataset id itself comes from the URL
 * path, not the body. Registering returns a model id (see ModelRegisterResponse) a caller then
 * runs repeatedly via POST /api/v1/dataset/{datasetId}/model/{modelId}/run without resending the
 * operations themselves on every run.
 */
public record ModelRegisterRequest(
        String name,
        List<ModelOperationInput> operations,
        List<String> inputOperationIds,
        List<String> outputOperationIds) {
}
