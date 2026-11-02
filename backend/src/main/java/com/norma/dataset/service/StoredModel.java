package com.norma.dataset.service;

import com.norma.dataset.dto.ModelOperationInput;

import java.util.List;

/**
 * A model registered via POST /api/v1/dataset/{datasetId}/model, kept in memory (see ModelStore)
 * so a later run (POST .../model/{modelId}/run) doesn't need the operations resent — only the
 * values a caller supplies for {@code inputOperationIds}, if the model has any. A run returns one
 * result per entry in {@code outputOperationIds} (always at least one).
 */
record StoredModel(
        /** Null for a model registered without a dataset. */
        String datasetId,
        String name,
        List<ModelOperationInput> operations,
        List<String> inputOperationIds,
        List<String> outputOperationIds) {
}
