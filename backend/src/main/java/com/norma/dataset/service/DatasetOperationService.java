package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
     * Adds up however many already-resolved values it's given — the live-editor counterpart of
     * {@link #computeCounter}, called the same way lookup/sum's own live endpoints are while a
     * model is being built (see DatasetOperationController), just with no dataset to look
     * anything up against: each value was already resolved client-side (a typed literal, or
     * another operation's own live result) before this is ever called.
     */
    public CounterResponse counter(CounterRequest request) {
        List<String> values = request.values() == null ? List.of() : request.values();
        if (values.isEmpty()) {
            throw new IllegalArgumentException("O contador não tem nenhuma entrada.");
        }

        double total = 0;
        for (String value : values) {
            total += parseCounterEntry(value);
        }
        return new CounterResponse(total);
    }

    /**
     * Passes a value straight through — the live-editor counterpart of {@link #computeNode},
     * called the same way lookup/sum/counter's own live endpoints are while a model is being
     * built. A node does no computation and has no dataset dependency; this exists purely so a
     * node's own result-reporting (and therefore its testSignal-gated "Testar modelo" flow) works
     * the same way every other kind's does.
     */
    public NodeResponse node(NodeRequest request) {
        return new NodeResponse(request.value() == null ? "" : request.value());
    }

    /**
     * Registers a model against a previously imported dataset so it can be run repeatedly
     * afterwards (see {@link #runModel}) without resending its operations on every run — only
     * the model's id, kept in memory by {@link ModelStore}, and (on each run) the values a caller
     * supplies for its designated input operations, if it has any.
     */
    public String registerModel(String datasetId, ModelRegisterRequest request) {
        datasetStore.get(datasetId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        List<ModelOperationInput> operations = request.operations();
        if (operations == null || operations.isEmpty()) {
            throw new IllegalArgumentException("O modelo não tem operações.");
        }
        List<String> outputOperationIds = request.outputOperationIds() == null ? List.of() : request.outputOperationIds();
        if (outputOperationIds.isEmpty()) {
            throw new IllegalArgumentException("O modelo não tem um output definido.");
        }

        Set<String> ids = operations.stream().map(ModelOperationInput::id).collect(Collectors.toSet());
        for (String outputOperationId : outputOperationIds) {
            if (!ids.contains(outputOperationId)) {
                throw new IllegalArgumentException("Um dos outputs indicados não corresponde a nenhuma operação do modelo.");
            }
        }
        List<String> inputOperationIds = request.inputOperationIds() == null ? List.of() : request.inputOperationIds();
        for (String inputOperationId : inputOperationIds) {
            if (!ids.contains(inputOperationId)) {
                throw new IllegalArgumentException("Um dos inputs indicados não corresponde a nenhuma operação do modelo.");
            }
        }

        StoredModel model = new StoredModel(datasetId, request.name(), operations, inputOperationIds, outputOperationIds);
        return modelStore.put(model);
    }

    /**
     * Runs a previously registered model and returns one result per designated output (always at
     * least one) — every other operation in the model is still computed as needed to resolve the
     * reference chain leading to each of them (kinds are dispatched, and "reference" inputs
     * resolved, the same way as the single-operation endpoints), it just was never something a
     * caller needed to see. {@code inputValues}, keyed by operation id, overrides the literal
     * value of each of the model's designated input operations for this run (ignored for a model
     * registered without any; an input operation missing its own entry is treated as an empty
     * string). A shared resolution cache is used across every output so an operation more than one
     * output's chain depends on is only ever computed once per run.
     */
    public List<ModelOperationResult> runModel(String datasetId, String modelId, Map<String, String> inputValues) {
        StoredModel model = modelStore.get(modelId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Modelo não encontrado. Volte a preparar o modelo antes de o correr."));

        if (!model.datasetId().equals(datasetId)) {
            throw new IllegalArgumentException("Este modelo não pertence ao conjunto de dados indicado.");
        }

        DatasetImportResponse dataset = datasetStore.get(datasetId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        List<ModelOperationInput> operations = withInputOverride(model, inputValues);

        Map<String, ModelOperationInput> byId = new LinkedHashMap<>();
        for (ModelOperationInput operation : operations) {
            byId.put(operation.id(), operation);
        }

        Set<String> cyclicIds = findCyclicIds(buildReferenceGraph(operations));
        Map<String, ModelOperationResult> resolved = new HashMap<>();
        return model.outputOperationIds().stream()
                .map(outputOperationId -> resolveOperation(outputOperationId, dataset, byId, cyclicIds, resolved))
                .toList();
    }

    /**
     * Swaps each registered input operation's "input" field for a literal wrapping the value this
     * run actually supplies for it — every other operation's fields (including any input
     * operation missing its own entry in {@code inputValues}, treated as an empty string) are
     * used exactly as registered.
     */
    private List<ModelOperationInput> withInputOverride(StoredModel model, Map<String, String> inputValues) {
        List<String> inputOperationIds = model.inputOperationIds();
        if (inputOperationIds == null || inputOperationIds.isEmpty()) {
            return model.operations();
        }
        Map<String, String> values = inputValues == null ? Map.of() : inputValues;
        Set<String> inputIds = Set.copyOf(inputOperationIds);
        return model.operations().stream()
                .map(operation -> inputIds.contains(operation.id())
                        ? withLiteralInput(operation, valueOrEmpty(values.get(operation.id())))
                        : operation)
                .toList();
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
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
                case "counter" -> computeCounter(operation, dataset, byId, cyclicIds, resolved);
                case "node" -> new ModelOperationResult(id, true, inputValue, null);
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
        if (!(fields.get("input") instanceof Map<?, ?> source)) {
            return "";
        }
        return resolveValueSource(asStringKeyedMap(source), dataset, byId, cyclicIds, resolved);
    }

    /**
     * Resolves a single value-source object (the same {@code {type, value|operationId}} shape
     * every chainable field — "input" or one entry of "inputs" — uses) to the literal string it
     * stands for: a literal value as-is, a reference recursively resolved against the operation
     * it points at. Shared by {@link #resolveInputValue} (kinds with one chainable field, e.g.
     * lookup) and {@link #computeCounter} (a kind with several).
     */
    private String resolveValueSource(
            Map<String, Object> source,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        if (!"reference".equals(source.get("type"))) {
            Object value = source.get("value");
            return value == null ? "" : String.valueOf(value);
        }

        if (!(source.get("operationId") instanceof String referencedId)) {
            throw new IllegalArgumentException("Refere uma operação que não existe no modelo.");
        }
        if (!byId.containsKey(referencedId)) {
            throw new IllegalArgumentException("Refere uma operação que não existe no modelo.");
        }

        ModelOperationResult referenced = resolveOperation(referencedId, dataset, byId, cyclicIds, resolved);
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
     * A counter has no dataset dependency of its own (unlike lookup/sum): it just adds up
     * whatever its "inputs" — each a value source, literal or chained off another operation's
     * result, same shape as lookup's single "input" — resolve to. Unlike every other kind, it can
     * have more than one chainable field, which is why cycle detection (see
     * {@link #buildReferenceGraph}) has to track more than one outgoing edge per operation.
     */
    private ModelOperationResult computeCounter(
            ModelOperationInput operation,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        Map<String, Object> fields = fieldsOf(operation);
        if (!(fields.get("inputs") instanceof List<?> inputs) || inputs.isEmpty()) {
            throw new IllegalArgumentException("O contador não tem nenhuma entrada.");
        }

        double total = 0;
        for (Object rawSource : inputs) {
            if (!(rawSource instanceof Map<?, ?> source)) {
                throw new IllegalArgumentException("Uma das entradas do contador está mal formada.");
            }
            String value = resolveValueSource(asStringKeyedMap(source), dataset, byId, cyclicIds, resolved);
            total += parseCounterEntry(value);
        }

        return new ModelOperationResult(operation.id(), true, normalizeNumber(total), null);
    }

    private double parseCounterEntry(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("O contador tem uma entrada sem valor.");
        }
        try {
            return Double.parseDouble(trimmed.replace(',', '.'));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("O contador tem uma entrada que não é numérica: " + trimmed);
        }
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

    /**
     * entryId -> every operationId it references — usually at most one (lookup's single "input"),
     * but a kind with several chainable fields (counter's "inputs" list) can have more than one,
     * so this is a multi-edge graph rather than a single successor per node.
     */
    private Map<String, List<String>> buildReferenceGraph(List<ModelOperationInput> operations) {
        Map<String, List<String>> edges = new HashMap<>();
        for (ModelOperationInput operation : operations) {
            edges.put(operation.id(), referencedOperationIds(fieldsOf(operation)));
        }
        return edges;
    }

    /**
     * Ids of every operation that sits on a reference cycle (directly or transitively
     * self-referencing), found via a DFS walk (coloring each node visiting/done) rather than
     * chasing a single successor per node, since a node can now have more than one outgoing edge.
     */
    private Set<String> findCyclicIds(Map<String, List<String>> edges) {
        Set<String> cyclic = new HashSet<>();
        Map<String, Boolean> done = new HashMap<>(); // absent = untouched, false = visiting, true = done
        List<String> stack = new ArrayList<>();
        for (String start : edges.keySet()) {
            if (!done.containsKey(start)) {
                visitForCycles(start, edges, done, stack, cyclic);
            }
        }
        return cyclic;
    }

    private void visitForCycles(
            String node, Map<String, List<String>> edges, Map<String, Boolean> done, List<String> stack, Set<String> cyclic) {
        done.put(node, false);
        stack.add(node);
        for (String next : edges.getOrDefault(node, List.of())) {
            Boolean state = done.get(next);
            if (Boolean.FALSE.equals(state)) {
                int cycleStart = stack.indexOf(next);
                cyclic.addAll(stack.subList(cycleStart, stack.size()));
            } else if (state == null) {
                visitForCycles(next, edges, done, stack, cyclic);
            }
        }
        stack.remove(stack.size() - 1);
        done.put(node, true);
    }

    /** Every operationId referenced by any chainable field in `fields` — "input" (a single value
     * source) and/or "inputs" (a list of them, e.g. counter). */
    private List<String> referencedOperationIds(Map<String, Object> fields) {
        List<String> ids = new ArrayList<>();
        referencedOperationId(fields.get("input")).ifPresent(ids::add);
        if (fields.get("inputs") instanceof List<?> inputs) {
            for (Object rawSource : inputs) {
                referencedOperationId(rawSource).ifPresent(ids::add);
            }
        }
        return ids;
    }

    private Optional<String> referencedOperationId(Object rawSource) {
        if (!(rawSource instanceof Map<?, ?> source) || !"reference".equals(source.get("type"))) {
            return Optional.empty();
        }
        return source.get("operationId") instanceof String operationId ? Optional.of(operationId) : Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asStringKeyedMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
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
