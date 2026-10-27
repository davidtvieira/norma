package com.norma.dataset.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.ModelInputsResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRunResponse;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.NrmImportStatus;
import com.norma.dataset.dto.NrmInfo;
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
 * is a zip holding exactly three entries: the dataset spreadsheet (.xlsx/.xls), the model
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
    private static final int SUPPORTED_VERSION = 1;
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

    private record Contents(String spreadsheetName, byte[] spreadsheetBytes, NrmInfo info, JsonNode model) {
    }

    /** Validates everything about the file without storing anything — used where only the model
     * half is wanted and a second copy of the dataset isn't.*/
    public NrmInfo validate(MultipartFile file) {
        Contents contents = read(file);
        ModelDatasetValidator.assertFits(contents.model(), sheetCountOf(contents));
        return contents.info();
    }

    /**
     * Validates a .nrm held as bytes — the same checks as an upload — and describes it for the library
     * (see NrmLibraryService): its name, when it was made, its dataset's file name and how many
     * operations, inputs and outputs the model has.
     */
    public NrmSummary inspect(byte[] bytes) {
        Contents contents = read("library.nrm", bytes);
        ModelDatasetValidator.assertFits(contents.model(), sheetCountOf(contents));
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
                readIds(contents.model(), "outputOperationIds", "outputOperationId").size());
    }

    /**
     * Validates the file, then stores everything in it: its dataset (parsed the same way a plain
     * import would), its model (registered the same way POST /dataset/{id}/model would — left
     * unregistered when it has no usable output) and the .nrm itself, under the id returned.
     */
    public NrmImportStatus importNrm(MultipartFile file) {
        return importContents(read(file));
    }

    /** {@link #importNrm(MultipartFile)} for a .nrm held as bytes, such as one read from the library. */
    public NrmImportStatus importNrm(byte[] bytes) {
        return importContents(read("library.nrm", bytes));
    }

    private NrmImportStatus importContents(Contents contents) {
        ModelDatasetValidator.assertFits(contents.model(), sheetCountOf(contents));
        DatasetImportResponse dataset = datasetParserService.parse(
                new ByteArrayInputStream(contents.spreadsheetBytes()), contents.spreadsheetName());
        String modelId = registerModel(dataset.datasetId(), contents.model());
        String nrmId = nrmStore.put(new StoredNrm(dataset.datasetId(), modelId, contents.info(), contents.model()));
        return NrmImportStatus.success(nrmId);
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
        return datasetParserService.get(get(nrmId).datasetId());
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
        List<ModelOperationInput> operations = new ArrayList<>();
        for (JsonNode node : model.path("operations")) {
            flatten(node, operations);
        }
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
        if (spreadsheetBytes == null) {
            throw invalid("does not contain a dataset (.xlsx/.xls).");
        }
        if (modelBytes == null) {
            throw invalid("does not contain a model (.json).");
        }
        if (infoBytes == null) {
            throw invalid("does not contain " + INFO_ENTRY_NAME + ".");
        }

        JsonNode model = parseJson(modelBytes, "the model");
        validateModel(model);
        return new Contents(spreadsheetName, spreadsheetBytes, parseInfo(parseJson(infoBytes, INFO_ENTRY_NAME)), model);
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
        if (!info.isObject() || !info.path("version").isInt() || info.path("version").asInt() != SUPPORTED_VERSION) {
            throw invalid(INFO_ENTRY_NAME + " has a missing or unsupported version.");
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
        return new NrmInfo(SUPPORTED_VERSION, name, createdAt);
    }

    private void validateModel(JsonNode model) {
        if (!model.isObject() || !model.path("operations").isArray() || !model.path("modelName").isTextual()) {
            throw invalid("the model is malformed.");
        }
        for (JsonNode node : model.path("operations")) {
            validateOperation(node);
        }
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
