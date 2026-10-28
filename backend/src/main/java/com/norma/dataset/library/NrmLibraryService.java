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
import java.util.Map;
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
    private final CategoryService categories;

    public NrmLibraryService(SavedNrmRepository repository, NrmFileStorage storage, NrmService nrmService,
                             CategoryService categories) {
        this.repository = repository;
        this.storage = storage;
        this.nrmService = nrmService;
        this.categories = categories;
    }

    /** A file for download: the name it should be saved as, and its bytes. */
    public record StoredFile(String filename, byte[] bytes) {
    }

    /**
     * What the library holds at one level: the categories and the saved .nrm files found. {@code categoryId} is the
     * category being looked into (null = the top level, where the .nrm files filed under no category are); only its
     * direct subcategories and the files filed right in it are listed, never what is deeper. {@code everywhere} ignores
     * that and looks at every category and every file. {@code search} keeps the categories whose name contains it and the
     * files whose name or dataset file name contains it (any case, nothing else is special); {@code sort} and
     * {@code direction} (the spellings of {@link SavedNrmSort}, each optional) order the files — the categories are by name.
     */
    @Transactional(readOnly = true)
    public LibraryListing list(String search, String sort, String direction, UUID categoryId, boolean everywhere) {
        SavedNrmSort field = SavedNrmSort.fromParameter(sort);
        Sort ordering = field.toSort(field.directionFrom(direction));
        Specification<SavedNrm> spec = matching(search);
        if (!everywhere) {
            if (categoryId == null) {
                spec = spec.and((root, query, builder) -> builder.isNull(root.get("categoryId")));
            } else {
                categories.requireExists(categoryId);
                spec = spec.and((root, query, builder) -> builder.equal(root.get("categoryId"), categoryId));
            }
        }
        Map<UUID, List<String>> paths = categories.namePaths();
        List<SavedNrmSummary> files = repository.findAll(spec, ordering).stream().map(saved -> toSummary(saved, paths)).toList();
        List<PathStep> path = !everywhere && categoryId != null ? categories.pathOf(categoryId) : List.of();
        return new LibraryListing(path, categories.entries(categoryId, search, everywhere), files, repository.count());
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

    /** Validates the .nrm and adds it to the library, filed under {@code categoryId} when given. */
    @Transactional
    public SavedNrmSummary save(byte[] bytes, UUID categoryId) {
        if (categoryId != null) {
            categories.requireExists(categoryId);
        }
        NrmSummary summary = nrmService.inspect(bytes);
        UUID id = UUID.randomUUID();
        storage.write(id, bytes);
        try {
            SavedNrm saved = new SavedNrm(id, now());
            saved.setCategoryId(categoryId);
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

    /** Files a saved .nrm under a category (null = none) without touching the file or its dates. */
    @Transactional
    public SavedNrmSummary assignCategory(UUID id, UUID categoryId) {
        SavedNrm saved = find(id);
        if (categoryId != null) {
            categories.requireExists(categoryId);
        }
        saved.setCategoryId(categoryId);
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
        return toSummary(saved, saved.getCategoryId() == null ? Map.of() : categories.namePaths());
    }

    private SavedNrmSummary toSummary(SavedNrm saved, Map<UUID, List<String>> paths) {
        return new SavedNrmSummary(saved.getId(), saved.getName(), saved.getDatasetFilename(), saved.getSizeBytes(),
                saved.getOperationCount(), saved.getInputCount(), saved.getOutputCount(), saved.getCategoryId(),
                saved.getCategoryId() == null ? List.of() : paths.getOrDefault(saved.getCategoryId(), List.of()), saved.getCreatedAt(),
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
