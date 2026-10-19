package com.norma.dataset.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds imported .nrm files in memory, keyed by a generated id handed back on import — mirrors
 * DatasetStore's and ModelStore's pattern. No persistence: restarting the backend loses every
 * imported .nrm, along with its dataset and model.
 */
@Component
public class NrmStore {

    private final Map<String, StoredNrm> nrms = new ConcurrentHashMap<>();

    public String put(StoredNrm nrm) {
        String nrmId = UUID.randomUUID().toString();
        nrms.put(nrmId, nrm);
        return nrmId;
    }

    public Optional<StoredNrm> get(String nrmId) {
        return Optional.ofNullable(nrmId).map(nrms::get);
    }
}
