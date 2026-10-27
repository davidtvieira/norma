package com.norma.dataset.library;

import com.norma.dataset.dto.NrmSummary;
import com.norma.dataset.dto.NrmOpenResponse;
import com.norma.dataset.service.NrmService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The library of saved .nrm files: the files are kept whole in the storage folder ({@link NrmFileStorage}) and
 * the database ({@link SavedNrm}) only knows what is needed to list them and find them again. Every file is
 * validated like an upload before it is kept, so what is in the library can always be opened: the app
 * downloads a saved file and imports it like any uploaded .nrm.
 */
@Service
public class NrmLibraryService {

    private static final Logger log = LoggerFactory.getLogger(NrmLibraryService.class);

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

    /**
     * The saved .nrm files, most recently saved first. {@code search} keeps those whose name or dataset file name
     * contains it (any case, nothing else is special); {@code sort} and {@code direction} are the spellings of
     * {@link SavedNrmSort}, each optional.
     */
    @Transactional(readOnly = true)
    public List<SavedNrmSummary> list(String search, String sort, String direction) {
        SavedNrmSort field = SavedNrmSort.fromParameter(sort);
        Sort ordering = field.toSort(field.directionFrom(direction));
        return repository.findAll(matching(search), ordering).stream().map(this::toSummary).toList();
    }

    private static Specification<SavedNrm> matching(String search) {
        if (search == null || search.isBlank()) {
            return Specification.where(null);
        }
        // % and _ are LIKE wildcards: escape them (and the escape character) so they match themselves.
        String pattern = "%" + search.trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return (root, query, builder) -> builder.or(
                builder.like(builder.lower(root.get("name")), pattern, '\\'),
                builder.like(builder.lower(root.get("datasetFilename")), pattern, '\\'));
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

    /**
     * Makes every listed name the one inside its file (the name in its info.json), which is the only name a saved
     * .nrm has. Run when the application starts, for entries listed under a name an older version had kept.
     * An entry whose file is missing or unreadable is left as it is.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void syncNamesWithFiles() {
        for (SavedNrm saved : repository.findAll()) {
            try {
                String name = nrmService.inspect(bytesOf(saved)).name();
                if (!name.equals(saved.getName())) {
                    saved.rename(name);
                }
            } catch (RuntimeException e) {
                log.debug("Left the name of saved .nrm {} as it is: its file cannot be read.", saved.getId(), e);
            }
        }
    }

    /** Brings a saved .nrm into use — its dataset and model are stored like an import's — from the file already kept. */
    @Transactional(readOnly = true)
    public NrmOpenResponse open(UUID id) {
        SavedNrm saved = find(id);
        return nrmService.open(id + ".nrm", bytesOf(saved), saved.getCreatedAt(), saved.getUpdatedAt());
    }

    @Transactional(readOnly = true)
    public StoredFile file(UUID id) {
        SavedNrm saved = find(id);
        return new StoredFile(downloadName(saved.getName()), bytesOf(saved));
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
