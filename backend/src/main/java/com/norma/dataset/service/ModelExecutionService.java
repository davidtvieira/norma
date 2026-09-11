package com.norma.dataset.service;

import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.TranslatorRule;
import com.norma.dataset.service.OperationSupport.FindOutcome;
import com.norma.dataset.service.OperationSupport.MatchMode;
import com.norma.dataset.service.OperationSupport.SumOutcome;
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
 * Registers a model (see {@link ModelStore}) against a previously imported dataset and runs it
 * by id — resolving "reference" (chained) inputs between its operations server-side, with cycle
 * detection, the same way OperationPanel's own client-side chain resolution does while a model
 * is still being built. Split out from {@link DatasetOperationService}, which keeps the
 * single-operation live-editor endpoints (lookup/sum/... each called individually while a model
 * is being built) — this service instead only ever deals with a whole model's operations at
 * once, addressed by a kind's untyped {@code Map<String,Object>} fields rather than a typed
 * per-endpoint request DTO. Range/match/translate mechanics both services need are shared via
 * {@link OperationSupport} rather than duplicated between them.
 */
@Service
public class ModelExecutionService {

    private final DatasetStore datasetStore;
    private final ModelStore modelStore;

    public ModelExecutionService(DatasetStore datasetStore, ModelStore modelStore) {
        this.datasetStore = datasetStore;
        this.modelStore = modelStore;
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
     * Removes a previously registered model. Deleting an already-deleted or unknown id, or one
     * that belongs to a different dataset than {@code datasetId}, is a request error rather than
     * a silent no-op, matching {@link #runModel}'s own ownership check.
     */
    public void deleteModel(String datasetId, String modelId) {
        StoredModel model = modelStore.get(modelId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Modelo não encontrado. Volte a preparar o modelo antes de o eliminar."));
        if (!model.datasetId().equals(datasetId)) {
            throw new IllegalArgumentException("Este modelo não pertence ao conjunto de dados indicado.");
        }
        modelStore.remove(modelId);
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
                case "lookup" -> computeLookup(operation, dataset, inputValue, byId, cyclicIds, resolved);
                case "sum" -> computeSum(operation, dataset);
                case "counter" -> computeCounter(operation, dataset, byId, cyclicIds, resolved);
                case "node" -> new ModelOperationResult(id, true, inputValue, null);
                case "find" -> computeFind(operation, dataset, inputValue);
                case "translator" -> computeTranslator(operation, inputValue);
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

    /**
     * Unlike {@code sheetIndex}/{@code resultColumn}, {@code searchColumn} and {@code startRow}
     * are themselves chainable fields now (same shape as "input") — typed directly, or, notably,
     * chained from a find operation's own combined {@code "rowIndex,columnIndex"} result (see
     * {@link #parseColumnIndex}/{@link #parseRowIndex}), so a lookup can search whichever column
     * (and/or start from whichever row) a find elsewhere in the model landed on. {@code startRow}
     * skips every row before it when scanning for a match (0 searches from the very first row,
     * same as before this field existed).
     */
    private ModelOperationResult computeLookup(
            ModelOperationInput operation,
            DatasetImportResponse dataset,
            String query,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        Map<String, Object> fields = fieldsOf(operation);
        int sheetIndex = intField(fields, "sheetIndex");
        int searchColumn = parseColumnIndex(
                resolveChainableField(fields, "searchColumn", dataset, byId, cyclicIds, resolved), "searchColumn");
        int startRow = parseRowIndex(
                resolveChainableField(fields, "startRow", dataset, byId, cyclicIds, resolved), "startRow");
        int resultColumn = intField(fields, "resultColumn");
        MatchMode matchMode = MatchMode.from(stringField(fields, "matchMode"));
        boolean tokenIgnoreSpaces = boolField(fields, "tokenIgnoreSpaces");
        boolean tokenIgnoreDashes = boolField(fields, "tokenIgnoreDashes");

        SheetData sheet = OperationSupport.sheetAt(dataset, sheetIndex, "onde procurar");
        String normalizedQuery = query == null ? "" : query.trim();

        Optional<com.norma.dataset.dto.RowData> matchRow = sheet.rows().stream()
                .filter(row -> row.rowIndex() >= startRow)
                .filter(row -> OperationSupport.matches(OperationSupport.cellValue(row, searchColumn), normalizedQuery, matchMode, tokenIgnoreSpaces, tokenIgnoreDashes))
                .findFirst();

        if (matchRow.isEmpty()) {
            return new ModelOperationResult(operation.id(), true, null, null);
        }

        return new ModelOperationResult(operation.id(), true, OperationSupport.cellValue(matchRow.get(), resultColumn), null);
    }

    private String resolveChainableField(
            Map<String, Object> fields,
            String fieldName,
            DatasetImportResponse dataset,
            Map<String, ModelOperationInput> byId,
            Set<String> cyclicIds,
            Map<String, ModelOperationResult> resolved) {

        if (!(fields.get(fieldName) instanceof Map<?, ?> source)) {
            throw new IllegalArgumentException("Campo obrigatório em falta ou inválido: " + fieldName);
        }
        return resolveValueSource(asStringKeyedMap(source), dataset, byId, cyclicIds, resolved);
    }

    /**
     * A chained column index can come straight from a find operation's own combined
     * {@code "rowIndex,columnIndex"} result (see the live find endpoint's frontend counterpart),
     * not just a plain typed number — so this takes whatever's after the last comma, if there is
     * one, rather than requiring the whole string to be a bare integer.
     */
    private int parseColumnIndex(String value, String fieldName) {
        String trimmed = value == null ? "" : value.trim();
        String raw = trimmed.contains(",") ? trimmed.substring(trimmed.lastIndexOf(',') + 1).trim() : trimmed;
        return parseNonNegativeInt(raw, trimmed, fieldName, "coluna");
    }

    /**
     * The row-index counterpart of {@link #parseColumnIndex} — a chained value can also come from
     * a find operation's combined {@code "rowIndex,columnIndex"} result, in which case this takes
     * whatever's *before* the first comma (the row half) rather than the column half.
     */
    private int parseRowIndex(String value, String fieldName) {
        String trimmed = value == null ? "" : value.trim();
        String raw = trimmed.contains(",") ? trimmed.substring(0, trimmed.indexOf(',')).trim() : trimmed;
        return parseNonNegativeInt(raw, trimmed, fieldName, "linha");
    }

    private int parseNonNegativeInt(String raw, String original, String fieldName, String kind) {
        try {
            int parsed = Integer.parseInt(raw);
            if (parsed < 0) {
                throw new NumberFormatException();
            }
            return parsed;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Valor de " + kind + " inválido em " + fieldName + ": " + original);
        }
    }

    private ModelOperationResult computeSum(ModelOperationInput operation, DatasetImportResponse dataset) {
        Map<String, Object> fields = fieldsOf(operation);
        int sheetIndex = intField(fields, "sheetIndex");
        Map<String, Object> range = mapField(fields, "range");
        int startRow = intField(range, "startRow");
        int endRow = intField(range, "endRow");
        int startColumn = intField(range, "startColumn");
        int endColumn = intField(range, "endColumn");

        SheetData sheet = OperationSupport.sheetAt(dataset, sheetIndex, "a somar");
        OperationSupport.validateRange(startRow, endRow, startColumn, endColumn);

        SumOutcome outcome = OperationSupport.sumRange(sheet, startRow, endRow, startColumn, endColumn);
        return new ModelOperationResult(operation.id(), true, OperationSupport.normalizeNumber(outcome.total()), null);
    }

    /**
     * Unlike lookup (which reads a value from a different column of the matched row), find
     * reports the position of the match itself — the first cell within its range whose value
     * matches {@code query} — as a "rowIndex,columnIndex" string, or null if nothing in the range
     * matches. A plain formatted string, not a map: this is what makes the result chainable
     * elsewhere in the model in the first place — every chained value is resolved to a string
     * (see resolveValueSource's {@code String.valueOf}), and a map's own toString has no defined
     * field order to parse back out reliably, whereas this format is exactly what
     * {@link #parseColumnIndex} (lookup's own dynamic searchColumn) expects, and matches the live
     * find endpoint's own frontend counterpart one-for-one.
     */
    private ModelOperationResult computeFind(ModelOperationInput operation, DatasetImportResponse dataset, String query) {
        Map<String, Object> fields = fieldsOf(operation);
        int sheetIndex = intField(fields, "sheetIndex");
        Map<String, Object> range = mapField(fields, "range");
        int startRow = intField(range, "startRow");
        int endRow = intField(range, "endRow");
        int startColumn = intField(range, "startColumn");
        int endColumn = intField(range, "endColumn");

        SheetData sheet = OperationSupport.sheetAt(dataset, sheetIndex, "onde procurar");
        OperationSupport.validateRange(startRow, endRow, startColumn, endColumn);
        String normalizedQuery = query == null ? "" : query.trim();

        FindOutcome outcome = OperationSupport.findInRange(sheet, startRow, endRow, startColumn, endColumn, normalizedQuery);
        Object value = outcome.found() ? outcome.rowIndex() + "," + outcome.columnIndex() : null;
        return new ModelOperationResult(operation.id(), true, value, null);
    }

    /**
     * A translator has no dataset dependency of its own (same as counter/node) — it just looks
     * {@code input} up against its own user-defined "rules" field. Throwing (rather than returning
     * a "not found" result the way computeLookup/computeFind do) for a value with no matching rule
     * is deliberate here: a translator is meant to be a strict function over a known domain, not a
     * best-effort search, so an out-of-domain value is treated the same as any other malformed
     * operation — caught by computeOperation's own IllegalArgumentException handling, same as
     * every other kind's validation failures.
     */
    private ModelOperationResult computeTranslator(ModelOperationInput operation, String input) {
        List<TranslatorRule> rules = OperationSupport.validateTranslatorRules(extractRules(fieldsOf(operation)));
        String normalizedInput = input == null ? "" : input.trim();
        return new ModelOperationResult(operation.id(), true, OperationSupport.translate(rules, normalizedInput), null);
    }

    /**
     * Reads a translator's "rules" field — a plain list of {@code {from, to}} objects, not a
     * chainable value source, since a rule's source/target are always typed directly, never
     * chained from another operation's result.
     */
    private List<TranslatorRule> extractRules(Map<String, Object> fields) {
        if (!(fields.get("rules") instanceof List<?> rawRules)) {
            throw new IllegalArgumentException("Campo obrigatório em falta ou inválido: rules");
        }
        List<TranslatorRule> rules = new ArrayList<>();
        for (Object rawRule : rawRules) {
            if (!(rawRule instanceof Map<?, ?> ruleMap)) {
                throw new IllegalArgumentException("Uma das regras do tradutor está mal formada.");
            }
            Map<String, Object> asMap = asStringKeyedMap(ruleMap);
            Object from = asMap.get("from");
            Object to = asMap.get("to");
            rules.add(new TranslatorRule(from == null ? null : String.valueOf(from), to == null ? null : String.valueOf(to)));
        }
        return rules;
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
            total += OperationSupport.parseCounterEntry(value);
        }

        return new ModelOperationResult(operation.id(), true, OperationSupport.normalizeNumber(total), null);
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

    /**
     * Every operationId referenced by any chainable field in `fields` — scanned structurally
     * (any field whose value is itself a reference-shaped map, e.g. "input" or lookup's own
     * "searchColumn", or a list of them, e.g. counter's "inputs") rather than by a fixed set of
     * field names, so a new chainable field on any kind is automatically covered here without
     * this needing to know its name in advance. A field that happens to be a plain map without a
     * "reference" type (e.g. sum/find's "range") is harmlessly skipped by referencedOperationId.
     */
    private List<String> referencedOperationIds(Map<String, Object> fields) {
        List<String> ids = new ArrayList<>();
        for (Object value : fields.values()) {
            if (value instanceof List<?> list) {
                for (Object rawSource : list) {
                    referencedOperationId(rawSource).ifPresent(ids::add);
                }
            } else {
                referencedOperationId(value).ifPresent(ids::add);
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

    /** Unlike {@link #intField}/{@link #mapField}, an optional field — absent (e.g. a model
     * registered before {@code matchMode} existed) is a valid, meaningful null, not an error. */
    private String stringField(Map<String, Object> fields, String key) {
        return fields.get(key) instanceof String value ? value : null;
    }

    /** Same as {@link #stringField}, but for an optional boolean field (e.g. lookup's
     * tokenIgnoreSpaces/tokenIgnoreDashes) — absent (a model saved before it existed, or simply
     * unset) defaults to false rather than erroring. */
    private boolean boolField(Map<String, Object> fields, String key) {
        return fields.get(key) instanceof Boolean value && value;
    }
}
