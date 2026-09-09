package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Runs data operations against a dataset previously imported and kept in memory by
 * {@link DatasetStore} — callers reference it by id instead of resending the full JSON. Models
 * (see {@link ModelStore}) work the same way: registered once, referenced by id on every run.
 */
@Service
public class DatasetOperationService {

    private final DatasetStore datasetStore;
    private final ModelStore modelStore;

    public DatasetOperationService(DatasetStore datasetStore, ModelStore modelStore) {
        this.datasetStore = datasetStore;
        this.modelStore = modelStore;
    }

    public LookupResponse lookup(LookupRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData searchSheet = sheetAt(dataset, request.searchSheetIndex(), "onde procurar");
        SheetData resultSheet = sheetAt(dataset, request.resultSheetIndex(), "a devolver");

        String normalizedQuery = request.query() == null ? "" : request.query().trim();

        Optional<RowData> matchRow = searchSheet.rows().stream()
                .filter(row -> matches(cellValue(row, request.searchColumn()), normalizedQuery))
                .findFirst();

        if (matchRow.isEmpty()) {
            return new LookupResponse(false, null, null);
        }

        Optional<RowData> resultRow = request.searchSheetIndex() == request.resultSheetIndex()
                ? matchRow
                : resultSheet.rows().stream()
                        .filter(row -> row.rowIndex() == matchRow.get().rowIndex())
                        .findFirst();

        if (resultRow.isEmpty()) {
            return new LookupResponse(false, null, null);
        }

        return new LookupResponse(true, cellValue(resultRow.get(), request.resultColumn()), matchRow.get().rowIndex());
    }

    public SumResponse sum(SumRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData sheet = sheetAt(dataset, request.sheetIndex(), "a somar");
        validateRange(request.startRow(), request.endRow(), request.startColumn(), request.endColumn());

        SumOutcome outcome = sumRange(sheet, request.startRow(), request.endRow(), request.startColumn(), request.endColumn());
        return new SumResponse(outcome.total(), outcome.cellsSummed());
    }

    /**
     * Registers a model against a previously imported dataset so it can be run repeatedly
     * afterwards (see {@link #runModel}) without resending its operations on every run — only
     * the model's id, kept in memory by {@link ModelStore}, and (on each run) the one value a
     * caller supplies for its designated input, if it has one.
     */
    public String registerModel(String datasetId, ModelRegisterRequest request) {
        datasetStore.get(datasetId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        List<ModelOperationInput> operations = request.operations();
        if (operations == null || operations.isEmpty()) {
            throw new IllegalArgumentException("O modelo não tem operações.");
        }
        if (request.outputOperationId() == null || request.outputOperationId().isBlank()) {
            throw new IllegalArgumentException("O modelo não tem um output definido.");
        }

        Set<String> ids = operations.stream().map(ModelOperationInput::id).collect(Collectors.toSet());
        if (!ids.contains(request.outputOperationId())) {
            throw new IllegalArgumentException("O output indicado não corresponde a nenhuma operação do modelo.");
        }
        if (request.inputOperationId() != null && !ids.contains(request.inputOperationId())) {
            throw new IllegalArgumentException("O input indicado não corresponde a nenhuma operação do modelo.");
        }

        StoredModel model = new StoredModel(
                datasetId, request.name(), operations, request.inputOperationId(), request.outputOperationId());
        return modelStore.put(model);
    }

    /**
     * Runs a previously registered model and returns only its designated output's result — every
     * other operation in the model is still computed as needed to resolve the reference chain
     * leading to that output (kinds are dispatched, and "reference" inputs resolved, the same way
     * as the single-operation endpoints), it just was never something a caller needed to see.
     * {@code inputValue} overrides the literal value of the model's designated input operation
     * for this run (ignored if the model was registered without one).
     */
    public ModelOperationResult runModel(String datasetId, String modelId, String inputValue) {
        StoredModel model = modelStore.get(modelId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Modelo não encontrado. Volte a preparar o modelo antes de o correr."));

        if (!model.datasetId().equals(datasetId)) {
            throw new IllegalArgumentException("Este modelo não pertence ao conjunto de dados indicado.");
        }

        DatasetImportResponse dataset = datasetStore.get(datasetId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        List<ModelOperationInput> operations = withInputOverride(model, inputValue);

        Map<String, ModelOperationInput> byId = new LinkedHashMap<>();
        for (ModelOperationInput operation : operations) {
            byId.put(operation.id(), operation);
        }

        Set<String> cyclicIds = findCyclicIds(buildReferenceGraph(operations));
        return resolveOperation(model.outputOperationId(), dataset, byId, cyclicIds, new HashMap<>());
    }

    /**
     * Swaps the registered input operation's "input" field for a literal wrapping the value this
     * run actually supplies — every other operation's fields are used exactly as registered.
     */
    private List<ModelOperationInput> withInputOverride(StoredModel model, String inputValue) {
        if (model.inputOperationId() == null) {
            return model.operations();
        }
        String value = inputValue == null ? "" : inputValue;
        return model.operations().stream()
                .map(operation -> operation.id().equals(model.inputOperationId())
                        ? withLiteralInput(operation, value)
                        : operation)
                .toList();
    }

    private ModelOperationInput withLiteralInput(ModelOperationInput operation, String value) {
        Map<String, Object> fields = new HashMap<>(fieldsOf(operation));
        fields.put("input", Map.of("type", "literal", "value", value));
        return new ModelOperationInput(operation.id(), operation.kind(), fields);
    }

    private ModelOperationResult resolveOperation(
            String id,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        ModelOperationResult cached = resolved.get(id);
        if (cached != null) {
            return cached;
        }

        ModelOperationResult result = computeOperation(id, dataset, byId, cyclicIds, resolved);
        resolved.put(id, result);
        return result;
    }

    private ModelOperationResult computeOperation(
            String id,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        if (cyclicIds.contains(id)) {
            return new ModelOperationResult(id, false, null, "Referência circular entre operações.");
        }

        ModelOperationInput operation = byId.get(id);
        if (operation == null) {
            return new ModelOperationResult(id, false, null, "Operação de referência não encontrada.");
        }

        try {
            String inputValue = resolveInputValue(operation, dataset, byId, cyclicIds, resolved);
            return switch (operation.kind()) {
                case "lookup" -> computeLookup(operation, dataset, inputValue);
                case "sum" -> computeSum(operation, dataset);
                default -> new ModelOperationResult(id, false, null, "Tipo de operação desconhecido: " + operation.kind());
            };
        } catch (IllegalArgumentException ex) {
            return new ModelOperationResult(id, false, null, ex.getMessage());
        }
    }

    /**
     * Resolves a "chainable" field the same way the frontend's getInputSource does: a literal
     * value is used as-is, a reference recursively resolves the operation it points at and uses
     * its (string-formatted) result. Kinds with no chainable field (e.g. sum) simply have no
     * "input" entry in their fields, so this falls back to an empty literal, same as the
     * frontend.
     */
    private String resolveInputValue(
            ModelOperationInput operation,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        Map<String, Object> fields = fieldsOf(operation);
        Optional<String> referencedId = referencedOperationId(fields);
        if (referencedId.isEmpty()) {
            return literalInputValue(fields);
        }

        if (!byId.containsKey(referencedId.get())) {
            throw new IllegalArgumentException("Refere uma operação que não existe no modelo.");
        }

        ModelOperationResult referenced = resolveOperation(referencedId.get(), dataset, byId, cyclicIds, resolved);
        if (!referenced.success() || referenced.value() == null) {
            throw new IllegalArgumentException("A operação de referência não produziu um resultado.");
        }
        return String.valueOf(referenced.value());
    }

    private ModelOperationResult computeLookup(ModelOperationInput operation, DatasetImportResponse dataset, String query) {
        Map<String, Object> fields = fieldsOf(operation);
        int sheetIndex = intField(fields, "sheetIndex");
        int searchColumn = intField(fields, "searchColumn");
        int resultColumn = intField(fields, "resultColumn");

        SheetData sheet = sheetAt(dataset, sheetIndex, "onde procurar");
        String normalizedQuery = query == null ? "" : query.trim();

        Optional<RowData> matchRow = sheet.rows().stream()
                .filter(row -> matches(cellValue(row, searchColumn), normalizedQuery))
                .findFirst();

        if (matchRow.isEmpty()) {
            return new ModelOperationResult(operation.id(), true, null, null);
        }

        return new ModelOperationResult(operation.id(), true, cellValue(matchRow.get(), resultColumn), null);
    }

    private ModelOperationResult computeSum(ModelOperationInput operation, DatasetImportResponse dataset) {
        Map<String, Object> fields = fieldsOf(operation);
        int sheetIndex = intField(fields, "sheetIndex");
        Map<String, Object> range = mapField(fields, "range");
        int startRow = intField(range, "startRow");
        int endRow = intField(range, "endRow");
        int startColumn = intField(range, "startColumn");
        int endColumn = intField(range, "endColumn");

        SheetData sheet = sheetAt(dataset, sheetIndex, "a somar");
        validateRange(startRow, endRow, startColumn, endColumn);

        SumOutcome outcome = sumRange(sheet, startRow, endRow, startColumn, endColumn);
        return new ModelOperationResult(operation.id(), true, normalizeNumber(outcome.total()), null);
    }

    /**
     * Mirrors DatasetParserService's own cell-value normalization (an independent copy, not
     * shared code — same convention as the frontend/backend cycle-detection duplication elsewhere
     * in this codebase). A whole-number sum needs to stringify the same way a whole-number cell
     * already does ("24", not "24.0") so a downstream reference to it (see resolveInputValue)
     * matches cells the same way the editor's own per-operation testing already does there — JS's
     * String(24.0) is "24", but Java's String.valueOf(24.0) is "24.0", which a plain Double never
     * getting normalized would otherwise carry through into the chained lookup's query.
     */
    private Object normalizeNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return (long) value;
        }
        return value;
    }

    private record SumOutcome(double total, int cellsSummed) {
    }

    private SumOutcome sumRange(SheetData sheet, int startRow, int endRow, int startColumn, int endColumn) {
        double total = 0;
        int cellsSummed = 0;
        for (RowData row : sheet.rows()) {
            if (row.rowIndex() < startRow || row.rowIndex() > endRow) {
                continue;
            }
            for (int column = startColumn; column <= endColumn; column++) {
                Object value = cellValue(row, column);
                if (value instanceof Number number) {
                    total += number.doubleValue();
                    cellsSummed++;
                }
            }
        }
        return new SumOutcome(total, cellsSummed);
    }

    /** entryId -> the operationId it references, for every operation whose "input" field is a reference. */
    private Map<String, String> buildReferenceGraph(List<ModelOperationInput> operations) {
        Map<String, String> edges = new HashMap<>();
        for (ModelOperationInput operation : operations) {
            referencedOperationId(fieldsOf(operation)).ifPresent(refId -> edges.put(operation.id(), refId));
        }
        return edges;
    }

    /** Ids of every operation that sits on a reference cycle (directly or transitively self-referencing). */
    private Set<String> findCyclicIds(Map<String, String> edges) {
        Set<String> cyclic = new HashSet<>();
        for (String start : edges.keySet()) {
            Set<String> seen = new HashSet<>();
            String current = start;
            while (current != null) {
                if (seen.contains(current)) {
                    if (current.equals(start)) {
                        cyclic.add(start);
                    }
                    break;
                }
                seen.add(current);
                current = edges.get(current);
            }
        }
        return cyclic;
    }

    private Optional<String> referencedOperationId(Map<String, Object> fields) {
        if (!(fields.get("input") instanceof Map<?, ?> source) || !"reference".equals(source.get("type"))) {
            return Optional.empty();
        }
        return source.get("operationId") instanceof String operationId ? Optional.of(operationId) : Optional.empty();
    }

    private String literalInputValue(Map<String, Object> fields) {
        if (fields.get("input") instanceof Map<?, ?> source && "literal".equals(source.get("type"))) {
            Object value = source.get("value");
            return value == null ? "" : String.valueOf(value);
        }
        return "";
    }

    private Map<String, Object> fieldsOf(ModelOperationInput operation) {
        return operation.fields() != null ? operation.fields() : Map.of();
    }

    private int intField(Map<String, Object> fields, String key) {
        if (!(fields.get(key) instanceof Number number)) {
            throw new IllegalArgumentException("Campo obrigatório em falta ou inválido: " + key);
        }
        return number.intValue();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapField(Map<String, Object> fields, String key) {
        if (!(fields.get(key) instanceof Map<?, ?> value)) {
            throw new IllegalArgumentException("Campo obrigatório em falta ou inválido: " + key);
        }
        return (Map<String, Object>) value;
    }

    private void validateRange(int startRow, int endRow, int startColumn, int endColumn) {
        if (startRow < 0 || startColumn < 0) {
            throw new IllegalArgumentException("O intervalo não pode começar numa linha ou coluna negativa.");
        }
        if (endRow < startRow || endColumn < startColumn) {
            throw new IllegalArgumentException("O fim do intervalo não pode ser anterior ao início.");
        }
    }

    private SheetData sheetAt(DatasetImportResponse dataset, int sheetIndex, String role) {
        List<SheetData> sheets = dataset.sheets();
        if (sheets == null || sheetIndex < 0 || sheetIndex >= sheets.size()) {
            throw new IllegalArgumentException("Índice de tabela inválido (" + role + "): " + sheetIndex);
        }
        return sheets.get(sheetIndex);
    }

    private Object cellValue(RowData row, int columnIndex) {
        // findFirst() wraps the element in Optional.of internally, which throws on a null
        // element — so find the (non-null) CellData first and only then read its (possibly
        // null, e.g. a blank cell) value via Optional.map.
        return row.cells().stream()
                .filter(cell -> cell.columnIndex() == columnIndex)
                .findFirst()
                .map(CellData::value)
                .orElse(null);
    }

    private boolean matches(Object cellValue, String normalizedQuery) {
        return cellValue != null && String.valueOf(cellValue).trim().equalsIgnoreCase(normalizedQuery);
    }
}
