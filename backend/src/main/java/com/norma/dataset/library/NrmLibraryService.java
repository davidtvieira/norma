package com.norma.dataset.library;

import com.norma.dataset.dto.NrmImportStatus;
import com.norma.dataset.dto.NrmSummary;
import com.norma.dataset.service.NrmService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * The library of saved .nrm files: the files are kept whole in the storage folder ({@link NrmFileStorage}) and
 * the database ({@link SavedNrm}) only knows what is needed to list them and find them again. Every file is
 * validated like an upload before it is kept, so what is in the library can always be opened. Opening one
 * hands it to the same import as an uploaded .nrm, so everything that works on an imported .nrm works on it.
 */
@Service
public class NrmLibraryService {

    private final SavedNrmRepository repository;
    private final NrmFileStorage storage;
    private final NrmService nrmService;

    public NrmLibraryService(SavedNrmRepository repository, NrmFileStorage storage, NrmService nrmService) {
        this.repository = repository;
        this.storage = storage;
        this.nrmService = nrmService;
    }

    /** A file for download: the name it should be saved as, and its bytes. */
    public record StoredFile(String filename, byte[] bytes) {
    }

    @Transactional(readOnly = true)
    public List<SavedNrmSummary> list() {
        return repository.findAllByOrderByUpdatedAtDesc().stream().map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public SavedNrmSummary get(UUID id) {
        return toSummary(find(id));
    }

    /** Validates the .nrm and adds it to the library. */
    @Transactional
    public SavedNrmSummary save(byte[] bytes) {
        NrmSummary summary = nrmService.inspect(bytes);
        UUID id = UUID.randomUUID();
        storage.write(id, bytes);
        try {
            SavedNrm saved = new SavedNrm(id, now());
            describe(saved, summary, bytes);
            return toSummary(repository.saveAndFlush(saved));
        } catch (RuntimeException e) {
            storage.delete(id); // no row, so no file either
            throw e;
        }
    }

    /** Validates the .nrm and puts it in place of a saved one, keeping its id and creation date. */
    @Transactional
    public SavedNrmSummary replace(UUID id, byte[] bytes) {
        SavedNrm saved = find(id);
        NrmSummary summary = nrmService.inspect(bytes);
        storage.write(id, bytes);
        describe(saved, summary, bytes);
        return toSummary(repository.saveAndFlush(saved));
    }

    @Transactional(readOnly = true)
    public StoredFile file(UUID id) {
        SavedNrm saved = find(id);
        return new StoredFile(downloadName(saved.getName()), bytesOf(saved));
    }

    /** Loads the saved .nrm into memory like an uploaded one, returning the id to address it by. */
    @Transactional(readOnly = true)
    public NrmImportStatus open(UUID id) {
        return nrmService.importNrm(bytesOf(find(id)));
    }

    @Transactional
    public void delete(UUID id) {
        repository.delete(find(id));
        storage.delete(id);
    }

    private SavedNrm find(UUID id) {
        return repository.findById(id).orElseThrow(() -> new SavedNrmNotFoundException("Saved .nrm not found."));
    }

    private byte[] bytesOf(SavedNrm saved) {
        return storage.read(saved.getId())
                .orElseThrow(() -> new SavedNrmNotFoundException("The file of this saved .nrm is missing."));
    }

    private void describe(SavedNrm saved, NrmSummary summary, byte[] bytes) {
        saved.describe(summary.name(), summary.datasetFilename(), bytes.length, sha256(bytes),
                summary.operationCount(), summary.inputCount(), summary.outputCount(), now());
    }

    private SavedNrmSummary toSummary(SavedNrm saved) {
        return new SavedNrmSummary(saved.getId(), saved.getName(), saved.getDatasetFilename(), saved.getSizeBytes(),
                saved.getOperationCount(), saved.getInputCount(), saved.getOutputCount(), saved.getCreatedAt(),
                saved.getUpdatedAt(), storage.exists(saved.getId()));
    }

    /** The current time at the precision PostgreSQL keeps (microseconds), so what is returned right after a save
     * equals what is read back later. */
    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    /** The model's name as a safe file name, ending in .nrm. */
    static String downloadName(String name) {
        String cleaned = name.replaceAll("[^\\p{L}\\p{N}._ -]", "_").trim();
        return (cleaned.isEmpty() ? "modelo" : cleaned) + ".nrm";
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
