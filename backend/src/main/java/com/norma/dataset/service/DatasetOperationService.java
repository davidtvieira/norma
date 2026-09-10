package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
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
import com.norma.dataset.dto.TranslatorRequest;
import com.norma.dataset.dto.TranslatorResponse;
import com.norma.dataset.dto.TranslatorRule;
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
        MatchMode matchMode = MatchMode.from(request.matchMode());

        Optional<RowData> matchRow = searchSheet.rows().stream()
                .filter(row -> row.rowIndex() >= request.startRow())
                .filter(row -> matches(cellValue(row, request.searchColumn()), normalizedQuery, matchMode))
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

    public FindResponse find(FindRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData sheet = sheetAt(dataset, request.sheetIndex(), "onde procurar");
        validateRange(request.startRow(), request.endRow(), request.startColumn(), request.endColumn());
        String normalizedQuery = request.query() == null ? "" : request.query().trim();

        FindOutcome outcome = findInRange(sheet, request.startRow(), request.endRow(), request.startColumn(), request.endColumn(), normalizedQuery);
        return new FindResponse(outcome.found(), outcome.rowIndex(), outcome.columnIndex());
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
     * Translates a value against a user-defined source-to-target mapping table — the live-editor
     * counterpart of {@link #computeTranslator}, called the same way every other kind's own live
     * endpoint is while a model is being built. No dataset dependency, same as counter/node: the
     * rules are entirely user-defined, not read from any table. A value with no matching rule is a
     * request error (see {@link #translate}), not a quiet non-match — unlike lookup/find, which
     * treat "nothing matched" as a legitimate, non-error result.
     */
    public TranslatorResponse translator(TranslatorRequest request) {
        List<TranslatorRule> rules = validateTranslatorRules(request.rules());
        String normalizedInput = request.input() == null ? "" : request.input().trim();
        return new TranslatorResponse(translate(rules, normalizedInput));
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

        SheetData sheet = sheetAt(dataset, sheetIndex, "onde procurar");
        String normalizedQuery = query == null ? "" : query.trim();

        Optional<RowData> matchRow = sheet.rows().stream()
                .filter(row -> row.rowIndex() >= startRow)
                .filter(row -> matches(cellValue(row, searchColumn), normalizedQuery, matchMode))
                .findFirst();

        if (matchRow.isEmpty()) {
            return new ModelOperationResult(operation.id(), true, null, null);
        }

        return new ModelOperationResult(operation.id(), true, cellValue(matchRow.get(), resultColumn), null);
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

        SheetData sheet = sheetAt(dataset, sheetIndex, "a somar");
        validateRange(startRow, endRow, startColumn, endColumn);

        SumOutcome outcome = sumRange(sheet, startRow, endRow, startColumn, endColumn);
        return new ModelOperationResult(operation.id(), true, normalizeNumber(outcome.total()), null);
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

        SheetData sheet = sheetAt(dataset, sheetIndex, "onde procurar");
        validateRange(startRow, endRow, startColumn, endColumn);
        String normalizedQuery = query == null ? "" : query.trim();

        FindOutcome outcome = findInRange(sheet, startRow, endRow, startColumn, endColumn, normalizedQuery);
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
        List<TranslatorRule> rules = validateTranslatorRules(extractRules(fieldsOf(operation)));
        String normalizedInput = input == null ? "" : input.trim();
        return new ModelOperationResult(operation.id(), true, translate(rules, normalizedInput), null);
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
     * Rejects an empty rule table, a rule with no source value, and — the rule this whole
     * operation exists to enforce — two rules sharing the same (trimmed, case-insensitive) source
     * value, which would leave the translation for that value ambiguous. Several rules sharing the
     * same target is fine (many sources translating to one target is the normal case), only
     * duplicate sources are rejected. Shared by both {@link #translator} (the live editor endpoint)
     * and {@link #computeTranslator} (model run), same as {@link #matches}/{@link #sheetAt} are
     * shared by lookup's own two entry points.
     */
    private List<TranslatorRule> validateTranslatorRules(List<TranslatorRule> rules) {
        List<TranslatorRule> nonNullRules = rules == null ? List.of() : rules;
        if (nonNullRules.isEmpty()) {
            throw new IllegalArgumentException("O tradutor não tem nenhuma regra.");
        }
        Set<String> seenSources = new HashSet<>();
        for (TranslatorRule rule : nonNullRules) {
            String from = rule.from() == null ? "" : rule.from().trim();
            if (from.isEmpty()) {
                throw new IllegalArgumentException("Uma das regras do tradutor não tem valor de origem.");
            }
            if (!seenSources.add(from.toLowerCase())) {
                throw new IllegalArgumentException("Duas regras do tradutor não podem ter o mesmo valor de origem: " + from);
            }
        }
        return nonNullRules;
    }

    /**
     * The actual source→target lookup, once {@code rules} is already known valid (see
     * {@link #validateTranslatorRules}) — a plain linear scan for the (trimmed, case-insensitive)
     * matching source, same match semantics as {@link #matches} (lookup/find's own). No matching
     * rule is a request error, not a null result — see computeTranslator's own note on why.
     */
    private String translate(List<TranslatorRule> rules, String normalizedInput) {
        return rules.stream()
                .filter(rule -> rule.from() != null && rule.from().trim().equalsIgnoreCase(normalizedInput))
                .findFirst()
                .map(TranslatorRule::to)
                .orElseThrow(() -> new IllegalArgumentException("Não existe nenhuma regra para o valor: " + normalizedInput));
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

    private record FindOutcome(boolean found, Integer rowIndex, Integer columnIndex) {
    }

    /** Scans the range row by row, then column by column within each row, for the first cell
     * matching {@code normalizedQuery} — shared by the live find endpoint and computeFind. */
    private FindOutcome findInRange(SheetData sheet, int startRow, int endRow, int startColumn, int endColumn, String normalizedQuery) {
        for (RowData row : sheet.rows()) {
            if (row.rowIndex() < startRow || row.rowIndex() > endRow) {
                continue;
            }
            for (int column = startColumn; column <= endColumn; column++) {
                if (matches(cellValue(row, column), normalizedQuery)) {
                    return new FindOutcome(true, row.rowIndex(), column);
                }
            }
        }
        return new FindOutcome(false, null, null);
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

    /** find/translator's own matching — always exact, same as lookup's own default (see the
     * {@link MatchMode}-aware overload below, which only lookup's two entry points call). */
    private boolean matches(Object cellValue, String normalizedQuery) {
        return matches(cellValue, normalizedQuery, MatchMode.EQUALS);
    }

    private boolean matches(Object cellValue, String normalizedQuery, MatchMode matchMode) {
        if (cellValue == null) {
            return false;
        }
        String normalizedCell = String.valueOf(cellValue).trim();
        return switch (matchMode) {
            case EQUALS -> normalizedCell.equalsIgnoreCase(normalizedQuery);
            case CONTAINS -> normalizedCell.toLowerCase().contains(normalizedQuery.toLowerCase());
        };
    }

    /** Lookup's search-column comparison: the whole cell must match the query exactly (EQUALS,
     * the original behavior), or just contain it somewhere (CONTAINS) — see {@link #matches}. */
    private enum MatchMode {
        EQUALS, CONTAINS;

        /** Null/blank (a model saved before this field existed, or an omitted request field) is
         * treated as EQUALS, so nothing already built or saved changes behavior. */
        static MatchMode from(String raw) {
            if (raw == null || raw.isBlank() || "equals".equalsIgnoreCase(raw)) {
                return EQUALS;
            }
            if ("contains".equalsIgnoreCase(raw)) {
                return CONTAINS;
            }
            throw new IllegalArgumentException("Tipo de comparação inválido: " + raw);
        }
    }
}
