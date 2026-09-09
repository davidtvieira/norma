package com.norma.dataset.service;

import com.norma.dataset.dto.ModelOperationInput;

import java.util.List;

/**
 * A model registered via POST /api/v1/dataset/{datasetId}/model, kept in memory (see ModelStore)
 * so a later run (POST .../model/{modelId}/run) doesn't need the operations resent — only the
 * one value a caller supplies for {@code inputOperationId}, if the model has one.
 */
record StoredModel(
        String datasetId,
        String name,
        List<ModelOperationInput> operations,
        String inputOperationId,
        String outputOperationId) {
}
