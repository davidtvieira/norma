package com.norma.dataset.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds registered models in memory, keyed by a generated id handed back to the caller on
 * registration — mirrors DatasetStore's own pattern for imported datasets. A run request then
 * references a model by that id instead of resending its operations on every call. No
 * persistence, same as DatasetStore: restarting the backend loses every registered model.
 */
@Component
public class ModelStore {

    private final Map<String, StoredModel> models = new ConcurrentHashMap<>();

    public String put(StoredModel model) {
        String modelId = UUID.randomUUID().toString();
        models.put(modelId, model);
        return modelId;
    }

    public Optional<StoredModel> get(String modelId) {
        return Optional.ofNullable(modelId).map(models::get);
    }
}
