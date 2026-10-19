package com.norma.dataset.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.NrmImportResponse;
import com.norma.dataset.dto.NrmInfo;
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
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Validates the content of an uploaded .nrm file — the frontend only checks the extension. A .nrm
 * is a zip holding exactly three entries: the dataset spreadsheet (.xlsx/.xls), the model
 * ({@code *.json}, not {@code info.json}), and {@code info.json} ({@link NrmInfo}). Anything else —
 * a missing or duplicated entry, an unexpected extra one, malformed JSON, an unknown operation
 * kind, a spreadsheet that can't be opened — is rejected, so a file only gets past here if it's
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
    private final ObjectMapper objectMapper = new ObjectMapper();

    public NrmService(DatasetParserService datasetParserService) {
        this.datasetParserService = datasetParserService;
    }

    private record Contents(String spreadsheetName, byte[] spreadsheetBytes, NrmInfo info) {
    }

    /** Validates everything about the file without storing anything — used where only the model
     * half is wanted and a second copy of the dataset isn't.*/
    public NrmInfo validate(MultipartFile file) {
        Contents contents = read(file);
        assertSpreadsheetReadable(contents);
        return contents.info();
    }

    /** Validates the file, then parses and stores its dataset the same way a plain import would. */
    public NrmImportResponse importNrm(MultipartFile file) {
        Contents contents = read(file);
        DatasetImportResponse dataset = datasetParserService.parse(
                new ByteArrayInputStream(contents.spreadsheetBytes()), contents.spreadsheetName());
        return new NrmImportResponse(dataset, contents.info());
    }

    private Contents read(MultipartFile file) {
        String originalName = file.getOriginalFilename();
        if (originalName == null || !originalName.toLowerCase(Locale.ROOT).endsWith(".nrm")) {
            throw new IllegalArgumentException(INVALID_MESSAGE);
        }
        if (file.isEmpty()) {
            throw new IllegalArgumentException(INVALID_MESSAGE);
        }

        String spreadsheetName = null;
        byte[] spreadsheetBytes = null;
        byte[] modelBytes = null;
        byte[] infoBytes = null;
        int entryCount = 0;
        long totalBytes = 0;

        try (ZipInputStream zip = new ZipInputStream(file.getInputStream())) {
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

        validateModel(parseJson(modelBytes, "the model"));
        return new Contents(spreadsheetName, spreadsheetBytes, parseInfo(parseJson(infoBytes, INFO_ENTRY_NAME)));
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

    private void assertSpreadsheetReadable(Contents contents) {
        try (Workbook ignored = WorkbookFactory.create(new ByteArrayInputStream(contents.spreadsheetBytes()))) {
            // Opening it is the whole check.
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
