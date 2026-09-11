package com.norma.dataset.service;

import com.norma.dataset.dto.DatasetImportResponse;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds imported datasets in memory, keyed by the id handed back to the caller on import.
 * Later operation requests reference a dataset by that id instead of resending the full
 * parsed JSON on every call.
 */
@Component
public class DatasetStore {

    private final Map<String, DatasetImportResponse> datasets = new ConcurrentHashMap<>();

    public void put(DatasetImportResponse dataset) {
        datasets.put(dataset.datasetId(), dataset);
    }

    public Optional<DatasetImportResponse> get(String datasetId) {
        return Optional.ofNullable(datasetId).map(datasets::get);
    }

    /** @return true if a dataset was actually removed, false if {@code datasetId} didn't exist. */
    public boolean remove(String datasetId) {
        return datasetId != null && datasets.remove(datasetId) != null;
    }
}
