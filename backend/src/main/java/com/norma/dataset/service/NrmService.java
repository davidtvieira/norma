package com.norma.dataset.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.DatasetImportStatus;
import com.norma.dataset.dto.ModelInputsResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRunResponse;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.NrmImportStatus;
import com.norma.dataset.dto.NrmInfo;
import com.norma.dataset.dto.NrmOpenResponse;
import com.norma.dataset.dto.NrmSummary;
import com.norma.dataset.exception.DatasetParsingException;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Validates the content of an uploaded .nrm file — the frontend only checks the extension. A .nrm
 * is a zip holding exactly three entries: the dataset spreadsheet (.xlsx/.xls — left out of a norma made
 * without a dataset, which may only hold the operation kinds that don't read one), the model
 * ({@code *.json}, not {@code info.json}), and {@code info.json} ({@link NrmInfo}). Anything else —
 * a missing or duplicated entry, an unexpected extra one, malformed JSON, an unknown operation
 * kind, a spreadsheet that can't be opened, a model pointing at sheets the spreadsheet doesn't have — is rejected, so a file only gets past here if it's
 * the format "Exportar modelo" produces.
 */
@Service
public class NrmService {

    private static final Logger log = LoggerFactory.getLogger(NrmService.class);
    private static final String INVALID_MESSAGE = "Invalid .nrm file.";
    private static final String INFO_ENTRY_NAME = "info.json";
    /** The longest description a .nrm may carry, in characters (the frontend's field stops at the same number). */
    public static final int MAX_DESCRIPTION_LENGTH = 2000;
    /** A .nrm only ever holds three files; this just bounds how much of a hostile zip is walked. */
    private static final int MAX_ENTRIES = 16;
    /** Cap on the total decompressed size, so a small zip bomb can't exhaust memory. */
    private static final long MAX_UNCOMPRESSED_BYTES = 50L * 1024 * 1024;

    private final DatasetParserService datasetParserService;
    private final ModelExecutionService modelExecutionService;
    private final NrmStore nrmStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public NrmService(
            DatasetParserService datasetParserService, ModelExecutionService modelExecutionService, NrmStore nrmStore) {
        this.datasetParserService = datasetParserService;
        this.modelExecutionService = modelExecutionService;
        this.nrmStore = nrmStore;
    }

    /** {@code spreadsheetBytes} is null for a .nrm that holds no dataset. */
    private record Contents(String spreadsheetName, byte[] spreadsheetBytes, NrmInfo info, JsonNode model) {
        boolean hasDataset() {
            return spreadsheetBytes != null;
        }
    }

    /** Validates everything about the file without storing anything — used where only the model
     * half is wanted and a second copy of the dataset isn't.*/
    public NrmInfo validate(MultipartFile file) {
        Contents contents = read(file);
        assertModelFits(contents);
        return contents.info();
    }

    /**
     * Validates a .nrm held as bytes — the same checks as an upload — and describes it for the library
     * (see NrmLibraryService): its name, when it was made, its dataset's file name and how many
     * operations, inputs and outputs the model has.
     */
    public NrmSummary inspect(byte[] bytes) {
        Contents contents = read("library.nrm", bytes);
        assertModelFits(contents);
        List<ModelOperationInput> operations = new ArrayList<>();
        for (JsonNode node : contents.model().path("operations")) {
            flatten(node, operations);
        }
        return new NrmSummary(
                contents.info().name(),
                contents.info().createdAt(),
                contents.spreadsheetName(),
                operations.size(),
                readIds(contents.model(), "inputOperationIds", "inputOperationId").size(),
                readIds(contents.model(), "outputOperationIds", "outputOperationId").size(),
                contents.info().description());
    }

    /**
     * Validates the file, then stores everything in it: its dataset (parsed the same way a plain
     * import would), its model (registered the same way POST /dataset/{id}/model would — left
     * unregistered when it has no usable output) and the .nrm itself, under the id returned.
     */
    public NrmImportStatus importNrm(MultipartFile file) {
        return importContents(read(file));
    }

    /**
     * The same import for a .nrm already held as bytes (a saved one, see NrmLibraryService) — nothing is uploaded,
     * and what the screen shows about the file comes back with the id, so the caller needs no copy of it.
     */
    public NrmOpenResponse open(String originalName, byte[] bytes, java.time.Instant createdAt, java.time.Instant updatedAt) {
        Contents contents = read(originalName, bytes);
        String nrmId = importContents(contents).nrmId();
        return new NrmOpenResponse(DatasetImportStatus.SUCCESS, nrmId, contents.info().name(), createdAt,
                contents.model().path("modelName").asText(""), contents.spreadsheetName(), updatedAt,
                contents.info().description());
    }

    private NrmImportStatus importContents(Contents contents) {
        assertModelFits(contents);
        String datasetId = contents.hasDataset()
                ? datasetParserService.parse(new ByteArrayInputStream(contents.spreadsheetBytes()), contents.spreadsheetName()).datasetId()
                : null;
        String modelId = registerModel(datasetId, contents.model());
        String nrmId = nrmStore.put(new StoredNrm(datasetId, modelId, contents.info(), contents.model()));
        return NrmImportStatus.success(nrmId);
    }

    /** The model must fit the dataset the file holds — or, in a file without one, must not need a dataset. */
    private void assertModelFits(Contents contents) {
        if (contents.hasDataset()) {
            ModelDatasetValidator.assertFits(contents.model(), sheetCountOf(contents));
        } else {
            ModelDatasetValidator.assertNoDatasetNeeded(contents.model());
        }
    }

    /**
     * Rewrites the model and the info of a .nrm held as bytes and returns the new file: the dataset is carried over byte for
     * byte, every entry under the same name and in the same order. Used by the one-off conversion of saved
     * normas (see the legacy package); the result is not validated here, whoever stores it does that.
     */
    public byte[] rewrite(byte[] nrmBytes, java.util.function.UnaryOperator<JsonNode> modelTransform, java.util.function.UnaryOperator<JsonNode> infoTransform) {
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        long totalBytes = 0;
        int entryCount = 0;
        boolean rewritten = false;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(nrmBytes));
                java.util.zip.ZipOutputStream out = new java.util.zip.ZipOutputStream(result)) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                if (++entryCount > MAX_ENTRIES) {
                    throw invalid("contains too many files.");
                }
                byte[] bytes = readEntry(in, MAX_UNCOMPRESSED_BYTES - totalBytes);
                totalBytes += bytes.length;
                String lower = baseName(entry.getName()).toLowerCase(Locale.ROOT);
                if (lower.equals(INFO_ENTRY_NAME)) {
                    bytes = objectMapper.writeValueAsBytes(infoTransform.apply(parseJson(bytes, INFO_ENTRY_NAME)));
                } else if (lower.endsWith(".json")) {
                    bytes = objectMapper.writeValueAsBytes(modelTransform.apply(parseJson(bytes, "the model")));
                    rewritten = true;
                }
                out.putNextEntry(new ZipEntry(entry.getName()));
                out.write(bytes);
                out.closeEntry();
            }
        } catch (IOException e) {
            throw new DatasetParsingException(INVALID_MESSAGE, e);
        }
        if (!rewritten) {
            throw invalid("does not contain a model (.json).");
        }
        return result.toByteArray();
    }

    /** The imported .nrm's model's designated inputs — see {@link ModelExecutionService#getModelInputs}. */
    public ModelInputsResponse getInputs(String nrmId) {
        return modelExecutionService.getModelInputs(modelIdOf(get(nrmId)));
    }

    /** One operation of the imported .nrm's model with its configuration — see {@link ModelExecutionService#getModelOperation}. */
    public com.norma.dataset.dto.ModelOperationInput getOperation(String nrmId, String operationId) {
        return modelExecutionService.getModelOperation(modelIdOf(get(nrmId)), operationId);
    }

    /** Runs the imported .nrm's model and also reports the watched operations — see {@link ModelExecutionService#runModelWatching}. */
    public ModelRunResponse runWatching(String nrmId, Map<String, String> inputValues, List<String> watchIds) {
        StoredNrm nrm = get(nrmId);
        return modelExecutionService.runModelWatching(nrm.datasetId(), modelIdOf(nrm), inputValues, watchIds);
    }

    /** Runs the imported .nrm's model — see {@link ModelExecutionService#runModel}. */
    public List<ModelOperationResult> run(String nrmId, Map<String, String> inputValues) {
        StoredNrm nrm = get(nrmId);
        return modelExecutionService.runModel(nrm.datasetId(), modelIdOf(nrm), inputValues);
    }

    /** The dataset (every sheet) stored from the imported .nrm's spreadsheet. */
    public DatasetImportResponse getDataset(String nrmId) {
        String datasetId = get(nrmId).datasetId();
        if (datasetId == null) {
            throw new IllegalArgumentException("This .nrm has no dataset.");
        }
        return datasetParserService.get(datasetId);
    }

    /**
     * The model JSON exactly as the imported .nrm held it (the operation tree, with names and canvas
     * positions) — only what editing the model needs, so nothing else asks for it. The .nrm's own
     * name from info.json, the source of truth for it, replaces whatever the model JSON carried.
     */
    public JsonNode getModel(String nrmId) {
        StoredNrm nrm = get(nrmId);
        ObjectNode model = nrm.model().deepCopy();
        model.put("nrmName", nrm.info().name());
        // The description too, from info.json (the source of truth for it); a norma with none carries no such field.
        if (nrm.info().description() != null) {
            model.put("nrmDescription", nrm.info().description());
        } else {
            model.remove("nrmDescription");
        }
        return model;
    }

    private StoredNrm get(String nrmId) {
        return nrmStore.get(nrmId)
                .orElseThrow(() -> new IllegalArgumentException("NRM not found. Please import the file again."));
    }

    private String modelIdOf(StoredNrm nrm) {
        if (nrm.modelId() == null) {
            throw new IllegalArgumentException("This .nrm has no model that can be used.");
        }
        return nrm.modelId();
    }

    /**
     * Flattens the model JSON's operation tree (the nesting only mirrors the canvas, every
     * reference lives in each operation's own fields) and registers it. Null when it has no
     * output, or the registration is rejected (an input/output id matching no operation).
     */
    private String registerModel(String datasetId, JsonNode model) {
        List<ModelOperationInput> operations = operationsOf(model);
        List<String> inputIds = readIds(model, "inputOperationIds", "inputOperationId");
        List<String> outputIds = readIds(model, "outputOperationIds", "outputOperationId");
        if (operations.isEmpty() || outputIds.isEmpty()) {
            return null;
        }
        try {
            return modelExecutionService.registerModel(
                    datasetId, new ModelRegisterRequest(model.path("modelName").asText(), operations, inputIds, outputIds));
        } catch (IllegalArgumentException e) {
            log.debug("Imported .nrm's model was not registered.", e);
            return null;
        }
    }

    /**
     * Every operation the engine runs for a model: the ones on its canvas (the tree, flattened) and, after them, the model's
     * settings as the operations they are to the engine: one formatter for each rule set in {@code settings.validation}, the
     * page selector of {@code settings.page} and the iterator of {@code settings.iteration}. The settings keep them out of the
     * canvas; the engine runs them as before.
     */
    private List<ModelOperationInput> operationsOf(JsonNode model) {
        List<ModelOperationInput> operations = new ArrayList<>();
        for (JsonNode node : model.path("operations")) {
            flatten(node, operations);
        }
        for (JsonNode ruleSet : model.path("settings").path("validation")) {
            Map<String, Object> fields = objectMapper.convertValue(ruleSet.path("fields"), new TypeReference<>() { });
            operations.add(new ModelOperationInput(ruleSet.path("id").asText(), "formatter", fields, ruleSet.path("name").asText()));
        }
        JsonNode page = model.path("settings").path("page");
        if (page.isObject()) {
            Map<String, Object> fields = objectMapper.convertValue(page.path("fields"), new TypeReference<>() { });
            operations.add(new ModelOperationInput(page.path("id").asText(), "page", fields, page.path("name").asText()));
        }
        JsonNode iteration = model.path("settings").path("iteration");
        if (iteration.isObject()) {
            Map<String, Object> fields = objectMapper.convertValue(iteration.path("fields"), new TypeReference<>() { });
            operations.add(new ModelOperationInput(iteration.path("id").asText(), "iterator", fields, iteration.path("name").asText()));
        }
        return operations;
    }

    private void flatten(JsonNode node, List<ModelOperationInput> out) {
        Map<String, Object> fields = objectMapper.convertValue(node.path("fields"), new TypeReference<>() { });
        out.add(new ModelOperationInput(
                node.path("id").asText(), node.path("kind").asText(), fields, node.path("name").asText()));
        for (JsonNode child : node.path("operations")) {
            flatten(child, out);
        }
    }

    /** The array field if present, else the older singular field wrapped in a list, else none. */
    private List<String> readIds(JsonNode model, String arrayField, String legacyField) {
        List<String> ids = new ArrayList<>();
        if (model.path(arrayField).isArray()) {
            model.path(arrayField).forEach(id -> {
                if (id.isTextual()) {
                    ids.add(id.asText());
                }
            });
        } else if (model.path(legacyField).isTextual()) {
            ids.add(model.path(legacyField).asText());
        }
        return ids;
    }

    private Contents read(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            log.debug("Rejected .nrm: its bytes cannot be read.", e);
            throw new DatasetParsingException(INVALID_MESSAGE, e);
        }
        return read(file.getOriginalFilename(), bytes);
    }

    private Contents read(String originalName, byte[] fileBytes) {
        if (originalName == null || !originalName.toLowerCase(Locale.ROOT).endsWith(".nrm")) {
            throw new IllegalArgumentException(INVALID_MESSAGE);
        }
        if (fileBytes.length == 0) {
            throw new IllegalArgumentException(INVALID_MESSAGE);
        }

        String spreadsheetName = null;
        byte[] spreadsheetBytes = null;
        byte[] modelBytes = null;
        byte[] infoBytes = null;
        int entryCount = 0;
        long totalBytes = 0;

        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(fileBytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                if (++entryCount > MAX_ENTRIES) {
                    throw invalid("contains too many files.");
                }
                byte[] bytes = readEntry(zip, MAX_UNCOMPRESSED_BYTES - totalBytes);
                totalBytes += bytes.length;

                String name = baseName(entry.getName());
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.equals(INFO_ENTRY_NAME)) {
                    if (infoBytes != null) {
                        throw invalid("contains more than one info.json.");
                    }
                    infoBytes = bytes;
                } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                    if (spreadsheetBytes != null) {
                        throw invalid("contains more than one dataset.");
                    }
                    spreadsheetName = name;
                    spreadsheetBytes = bytes;
                } else if (lower.endsWith(".json")) {
                    if (modelBytes != null) {
                        throw invalid("contains more than one model.");
                    }
                    modelBytes = bytes;
                } else {
                    throw invalid("contains an unexpected file: " + name);
                }
            }
        } catch (IOException e) {
            log.debug("Rejected .nrm: not a valid zip archive.", e);
            throw new DatasetParsingException(INVALID_MESSAGE, e);
        }

        if (entryCount == 0) {
            throw invalid("not a valid zip archive, or empty.");
        }
        if (modelBytes == null) {
            throw invalid("does not contain a model (.json).");
        }
        if (infoBytes == null) {
            throw invalid("does not contain " + INFO_ENTRY_NAME + ".");
        }

        JsonNode model = parseJson(modelBytes, "the model");
        validateModel(model);
        NrmInfo info = parseInfo(parseJson(infoBytes, INFO_ENTRY_NAME));
        return new Contents(spreadsheetName, spreadsheetBytes, info, model);
    }

    private byte[] readEntry(InputStream in, long remainingBudget) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > remainingBudget) {
                throw invalid("is too large once decompressed.");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static String baseName(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private JsonNode parseJson(byte[] bytes, String what) {
        try {
            return objectMapper.readTree(bytes);
        } catch (IOException e) {
            log.debug("Rejected .nrm: {} is not valid JSON.", what, e);
            throw new DatasetParsingException(INVALID_MESSAGE, e);
        }
    }

    private NrmInfo parseInfo(JsonNode info) {
        if (!info.isObject()) {
            throw invalid(INFO_ENTRY_NAME + " is malformed.");
        }
        String name = info.path("name").isTextual() ? info.path("name").asText().trim() : "";
        if (name.isEmpty()) {
            throw invalid(INFO_ENTRY_NAME + " has no name.");
        }
        Instant createdAt;
        try {
            createdAt = Instant.parse(info.path("createdAt").asText(""));
        } catch (DateTimeParseException e) {
            throw invalid(INFO_ENTRY_NAME + " has no valid creation date.");
        }
        String description = info.path("description").isTextual() ? info.path("description").asText().trim() : "";
        if (description.length() > MAX_DESCRIPTION_LENGTH) {
            throw invalid(INFO_ENTRY_NAME + " has a description that is too long.");
        }
        return new NrmInfo(name, createdAt, description.isEmpty() ? null : description);
    }

    private void validateModel(JsonNode model) {
        if (!model.isObject() || !model.path("operations").isArray() || !model.path("modelName").isTextual()) {
            throw invalid("the model is malformed.");
        }
        for (JsonNode node : model.path("operations")) {
            validateOperation(node);
        }
        validateSettings(model.path("settings"));
    }

    /** The model's optional settings: its input validation rule sets, its page selector and its iteration, each an id, a name and its fields. */
    private void validateSettings(JsonNode settings) {
        if (settings.isMissingNode() || settings.isNull()) {
            return;
        }
        if (!settings.isObject() || (!settings.path("validation").isMissingNode() && !settings.path("validation").isArray())) {
            throw invalid("the model has malformed settings.");
        }
        for (JsonNode ruleSet : settings.path("validation")) {
            if (!isSettingEntry(ruleSet)) {
                throw invalid("the model has a malformed validation rule set.");
            }
        }
        if (!settings.path("page").isMissingNode() && !isSettingEntry(settings.path("page"))) {
            throw invalid("the model has a malformed page selector setting.");
        }
        if (!settings.path("iteration").isMissingNode() && !isSettingEntry(settings.path("iteration"))) {
            throw invalid("the model has a malformed iteration setting.");
        }
    }

    private static boolean isSettingEntry(JsonNode entry) {
        return entry.isObject() && entry.path("id").isTextual() && entry.path("name").isTextual() && entry.path("fields").isObject();
    }

    private void validateOperation(JsonNode node) {
        if (!node.isObject()
                || !node.path("id").isTextual()
                || !node.path("kind").isTextual()
                || !node.path("name").isTextual()
                || !node.path("fields").isObject()) {
            throw invalid("the model has a malformed operation.");
        }
        if (!OperationTypes.isKnown(node.path("kind").asText())) {
            throw invalid("the model has an unknown operation type: " + node.path("kind").asText());
        }
        JsonNode children = node.path("operations");
        if (!children.isMissingNode() && !children.isArray()) {
            throw invalid("the model has a malformed operation.");
        }
        for (JsonNode child : children) {
            validateOperation(child);
        }
    }

    /** Opens the spreadsheet — it must be readable — and returns how many sheets it has. */
    private int sheetCountOf(Contents contents) {
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(contents.spreadsheetBytes()))) {
            return workbook.getNumberOfSheets();
        } catch (IOException | RuntimeException e) {
            log.debug("Rejected .nrm: its dataset {} cannot be opened.", contents.spreadsheetName(), e);
            throw new DatasetParsingException(INVALID_MESSAGE, e);
        }
    }

    /** The reason is only logged — every rejection reads the same to the caller. */
    private static DatasetParsingException invalid(String reason) {
        log.debug("Rejected .nrm: {}", reason);
        return new DatasetParsingException(INVALID_MESSAGE);
    }
}
