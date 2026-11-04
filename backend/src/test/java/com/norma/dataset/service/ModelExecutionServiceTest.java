package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.DatasetTouch;
import com.norma.dataset.dto.ModelInputsResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.ModelRunResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers model registration, running (including chained "reference" inputs and cycle detection
 * across every operation kind), and deletion — the graph-resolution behavior that used to live
 * in {@link DatasetOperationServiceTest} back when one service class implemented both that and
 * the single-operation live-editor endpoints. See {@link DatasetOperationServiceTest} for those.
 */
class ModelExecutionServiceTest {

    private final DatasetStore datasetStore = new DatasetStore();
    private final ModelStore modelStore = new ModelStore();
    private final ModelExecutionService modelExecutionService = new ModelExecutionService(datasetStore, modelStore);

    private String twoSheetDataset() {
        SheetData clients = new SheetData("Clientes", 3, List.of(
                new RowData(0, List.of(new CellData(0, "1"), new CellData(1, "Ana"))),
                new RowData(1, List.of(new CellData(0, "2"), new CellData(1, "Bruno"))),
                new RowData(2, List.of(new CellData(0, "3"), new CellData(1, "Carla")))
        ));
        SheetData orders = new SheetData("Encomendas", 3, List.of(
                new RowData(0, List.of(new CellData(0, "1"), new CellData(1, "Livro"))),
                new RowData(1, List.of(new CellData(0, "2"), new CellData(1, "Caneta"))),
                new RowData(2, List.of(new CellData(0, "3"), new CellData(1, "Mochila")))
        ));
        return storeDataset(new DatasetImportResponse("dataset-1", "test.xlsx", Instant.now(), List.of(clients, orders)));
    }

    private String storeDataset(DatasetImportResponse dataset) {
        datasetStore.put(dataset);
        return dataset.datasetId();
    }

    /**
     * Registers a model with a single designated output and immediately runs it, returning that
     * one result — the shape most of these tests only care about; see registerAndRunMulti for
     * tests exercising more than one designated output at once.
     */
    private ModelOperationResult registerAndRun(
            String datasetId,
            List<ModelOperationInput> operations,
            List<String> inputOperationIds,
            String outputOperationId,
            Map<String, String> inputValues) {
        return registerAndRunMulti(datasetId, operations, inputOperationIds, List.of(outputOperationId), inputValues).get(0);
    }

    private List<ModelOperationResult> registerAndRunMulti(
            String datasetId,
            List<ModelOperationInput> operations,
            List<String> inputOperationIds,
            List<String> outputOperationIds,
            Map<String, String> inputValues) {
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, inputOperationIds, outputOperationIds));
        return modelExecutionService.runModel(datasetId, modelId, inputValues);
    }

    @Test
    void runsAModelRegisteredWithoutADataset() {
        ModelOperationInput node = new ModelOperationInput("n", "node", Map.of("input", literalInput("")), "Valor");
        ModelOperationInput calc = new ModelOperationInput("c", "calc",
                Map.of("inputs", List.of(referenceInput("n"), literalInput("2")), "operation", "multiply"), "Dobro");

        String modelId = modelExecutionService.registerModel(
                null, new ModelRegisterRequest("Sem dados", List.of(node, calc), List.of("n"), List.of("c")));

        assertThat(modelExecutionService.runModelWatching(null, modelId, Map.of("n", "21"), null).results())
                .singleElement().satisfies(result -> {
                    assertThat(result.success()).isTrue();
                    assertThat(result.value()).hasToString("42");
                });
        modelExecutionService.deleteModel(null, modelId);
    }

    @Test
    void aModelWithoutADatasetCannotHoldAKindThatReadsOne() {
        ModelOperationInput sum = new ModelOperationInput("s", "find", Map.of(), "Procurar");

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                null, new ModelRegisterRequest("Sem dados", List.of(sum), List.of(), List.of("s"))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("needs a dataset");
    }

    private Map<String, Object> literalInput(String value) {
        return Map.of("type", "literal", "value", value);
    }

    private Map<String, Object> referenceInput(String operationId) {
        return Map.of("type", "reference", "operationId", operationId);
    }

    @Test
    void runsALookupOperationWithALiteralInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
        assertThat(result.error()).isNull();
    }

    @Test
    void reportsThePartsOfTheDatasetAnOutputsChainRead() {
        String datasetId = twoSheetDataset();

        ModelOperationInput first = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 0));
        ModelOperationInput second = new ModelOperationInput("op-2", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-1"),
                "sheetIndex", 1,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(first, second), null, "op-2", null);

        assertThat(result.value()).isEqualTo("Caneta");
        assertThat(result.touches()).contains(
                DatasetTouch.column(0, "search", 0),
                DatasetTouch.cell(0, "result", 1, 0),
                DatasetTouch.column(1, "result", 1),
                DatasetTouch.cell(1, "result", 1, 1));
    }

    @Test
    void returnsTheWatchedOperationsNextToTheOutputsAndListsEveryOperation() {
        String datasetId = twoSheetDataset();
        ModelOperationInput first = node("op-1", "2");
        ModelOperationInput second = new ModelOperationInput("op-2", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-1"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 0), "");
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", List.of(first, second), null, List.of("op-2")));

        assertThat(modelExecutionService.getModelInputs(modelId).operations()).extracting("id", "name", "kind")
                .containsExactly(
                        org.assertj.core.api.Assertions.tuple("op-1", "op-1", "node"),
                        org.assertj.core.api.Assertions.tuple("op-2", "lookup", "lookup"));

        assertThat(modelExecutionService.getModelOperation(modelId, "op-2").fields()).containsKey("searchColumn");
        assertThatThrownBy(() -> modelExecutionService.getModelOperation(modelId, "missing"))
                .isInstanceOf(IllegalArgumentException.class);

        ModelRunResponse run = modelExecutionService.runModelWatching(
                datasetId, modelId, null, List.of("op-1", "missing"));

        assertThat(run.results()).hasSize(1);
        assertThat(run.watched()).singleElement().satisfies(result -> {
            assertThat(result.id()).isEqualTo("op-1");
            assertThat(result.name()).isEqualTo("op-1");
            assertThat(result.value()).isEqualTo("2");
        });
    }

    @Test
    void chainsALookupsResultIntoAnotherLookupsInput() {
        String datasetId = twoSheetDataset();

        // op-1 finds the row whose name (column 1) is "Bruno" and returns its id (column 0) = "2".
        ModelOperationInput findId = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Bruno"),
                "sheetIndex", 0,
                "searchColumn", literalInput("1"),
                "resultColumn", 0));

        // op-2 chains off op-1's result ("2") as the query against the orders sheet.
        ModelOperationInput findOrder = new ModelOperationInput("op-2", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-1"),
                "sheetIndex", 1,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        List<ModelOperationInput> operations = List.of(findId, findOrder);

        ModelOperationResult op1Result = registerAndRun(datasetId, operations, null, "op-1", null);
        assertThat(op1Result.value()).isEqualTo("2");

        ModelOperationResult op2Result = registerAndRun(datasetId, operations, null, "op-2", null);
        assertThat(op2Result.success()).isTrue();
        assertThat(op2Result.value()).isEqualTo("Caneta");
    }

    @Test
    void chainsAWholeNumberCalcResultIntoALookupsInputWithoutATrailingDecimal() {
        SheetData clients = new SheetData("Clientes", 3, List.of(
                new RowData(0, List.of(new CellData(0, 10L), new CellData(1, "Ana"))),
                new RowData(1, List.of(new CellData(0, 15L), new CellData(1, "Bruno")))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-calc-lookup-chain", "test.xlsx", Instant.now(), List.of(clients)));

        // Adds up to a whole number (15) that must match a Long-typed cell's own "15" — a naive
        // String.valueOf(Double) on the raw total would instead produce "15.0" and never match.
        ModelOperationInput sum = new ModelOperationInput("op-1", "calc", Map.of(
                "inputs", List.of(literalInput("10"), literalInput("5")), "operation", "add", "format", "none"));
        ModelOperationInput findByTotal = new ModelOperationInput("op-2", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-1"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(sum, findByTotal), null, "op-2", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
    }

    @Test
    void reportsACircularReferenceAsAnErrorInsteadOfThrowing() {
        String datasetId = twoSheetDataset();

        ModelOperationInput opA = new ModelOperationInput("op-a", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-b"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));
        ModelOperationInput opB = new ModelOperationInput("op-b", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-a"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(opA, opB), null, "op-a", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsAnUnknownReferenceAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("does-not-exist"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsAnUnknownOperationKindOnTheOutputAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput unknown = new ModelOperationInput("op-1", "does-not-exist", Map.of());

        ModelOperationResult result = registerAndRun(datasetId, List.of(unknown), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void ignoresAnUnrelatedOperationNotOnTheOutputsReferenceChainEvenIfItsKindIsUnknown() {
        String datasetId = twoSheetDataset();

        ModelOperationInput unknown = new ModelOperationInput("op-1", "does-not-exist", Map.of());
        ModelOperationInput sum = new ModelOperationInput("op-2", "calc", Map.of("inputs", List.of(literalInput("1")), "operation", "add", "format", "none"));

        // Only what the output (op-2) actually depends on gets computed — op-1 is never referenced
        // by it, so its broken kind never gets in the way of running the model for op-2.
        ModelOperationResult result = registerAndRun(datasetId, List.of(unknown, sum), null, "op-2", null);

        assertThat(result.success()).isTrue();
    }

    @Test
    void overridesTheRegisteredInputsLiteralValueAtRunTime() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("this value is only used if a run doesn't override it"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", List.of(lookup), List.of("op-1"), List.of("op-1")));

        ModelOperationResult result = modelExecutionService.runModel(datasetId, modelId, Map.of("op-1", "3")).get(0);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Carla");
    }

    @Test
    void treatsAMissingInputValueAsAnEmptyStringWhenTheModelHasADesignatedInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));

        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", List.of(lookup), List.of("op-1"), List.of("op-1")));

        ModelOperationResult result = modelExecutionService.runModel(datasetId, modelId, null).get(0);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isNull();
    }

    @Test
    void rejectsRegisteringAModelWithoutAnOutputOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRegisteringAModelWhoseOutputDoesNotMatchAnyOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("does-not-exist"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownDatasetIdWhenRegisteringAModel() {
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                "missing-dataset", new ModelRegisterRequest("Test model", operations, null, List.of("op-1"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void addsAllOfACalcsInputs() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "calc", Map.of(
                "inputs", List.of(literalInput("2"), literalInput("3.5"), literalInput("10")), "operation", "add", "format", "none"));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(15.5);
    }

    @Test
    void addsSeveralOtherOperationsResultsThroughACalc() {
        SheetData sales = new SheetData("Vendas", 2, List.of(
                new RowData(0, List.of(new CellData(0, 10L))),
                new RowData(1, List.of(new CellData(0, 5L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-calc-1", "test.xlsx", Instant.now(), List.of(sales)));

        ModelOperationInput sumA = new ModelOperationInput("op-a", "node", Map.of("input", literalInput("10")));
        ModelOperationInput sumB = new ModelOperationInput("op-b", "node", Map.of("input", literalInput("5")));
        // The calc takes both values as inputs — unlike most kinds
        // kind (at most one chainable field), it can chain off several operations at once.
        ModelOperationInput counter = new ModelOperationInput("op-counter", "calc", Map.of(
                "inputs", List.of(referenceInput("op-a"), referenceInput("op-b"), literalInput("100")), "operation", "add", "format", "none"));

        ModelOperationResult result = registerAndRun(
                datasetId, List.of(sumA, sumB, counter), null, "op-counter", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(115L);
    }

    private ModelOperationInput iterator(int startSheet, int endSheet) {
        return new ModelOperationInput("op-iter", "iterator", Map.of("startSheet", startSheet, "endSheet", endSheet));
    }

    private ModelOperationInput idToNameLookup(boolean useIteratorSheet) {
        // Picked against sheet 0 (the "sample" sheet); with useIteratorSheet it runs on each round's sheet instead.
        return new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("2"),
                "sheetIndex", 0,
                "useIteratorSheet", useIteratorSheet,
                "searchColumn", literalInput("0"),
                "resultColumn", 1));
    }

    @Test
    void iteratorMovesALookupsSearchToEachSheetButStillReadsTheResultFromItsOwn() {
        String datasetId = twoSheetDataset();

        // Created against the clients sheet (0), looking for "Caneta" in column 1 and returning column 0.
        // Round 0 searches the clients sheet (no "Caneta" there); round 1 searches the orders sheet,
        // finds it on row 1 — and the result is that row's column 0 on the *clients* sheet ("2"),
        // not read from the orders sheet itself.
        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Caneta"),
                "sheetIndex", 0,
                "useIteratorSheet", true,
                "searchColumn", literalInput("1"),
                "resultColumn", 0));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), lookup), null, List.of("op-1"), null);

        assertThat(results).extracting(ModelOperationResult::name).containsExactly("0", "1");
        assertThat(results).extracting(ModelOperationResult::value).containsExactly(null, "2");
        assertThat(results).extracting(ModelOperationResult::id).doesNotHaveDuplicates();
    }

    @Test
    void iteratorMovesAFindsSheetBecauseItHasNoOtherSheetToReadFrom() {
        SheetData first = new SheetData("A", 2, List.of(new RowData(0, List.of(new CellData(0, "k")))));
        SheetData second = new SheetData("B", 2, List.of(new RowData(0, List.of(new CellData(1, "k")))));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-iter-find", "test.xlsx", Instant.now(), List.of(first, second)));

        ModelOperationInput find = new ModelOperationInput("op-1", "find", Map.of(
                "input", literalInput("k"),
                "sheetIndex", 0,
                "useIteratorSheet", true,
                "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 1)));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), find), null, List.of("op-1"), null);

        // The same range on each sheet: the match is at column 0 of the first and column 1 of the second.
        assertThat(results).extracting(ModelOperationResult::value).containsExactly("0,0", "0,1");
    }

    @Test
    void iteratorOutputsItsPositionInTheRangeNotTheSheetIndex() {
        SheetData first = new SheetData("A", 1, List.of(new RowData(0, List.of(new CellData(0, "2"), new CellData(1, "a")))));
        SheetData second = new SheetData("B", 1, List.of(new RowData(0, List.of(new CellData(0, "2"), new CellData(1, "b")))));
        SheetData third = new SheetData("C", 1, List.of(new RowData(0, List.of(new CellData(0, "2"), new CellData(1, "c")))));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-iter-offset", "test.xlsx", Instant.now(), List.of(first, second, third)));

        // Range 1-2: the iterator (and the result names) count 0, 1 rather than 1, 2.
        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", referenceInput("op-iter")));
        List<ModelOperationResult> positions = registerAndRunMulti(
                datasetId, List.of(iterator(1, 2), node), null, List.of("op-node"), null);
        assertThat(positions).extracting(ModelOperationResult::value).containsExactly("0", "1");

        List<ModelOperationResult> lookups = registerAndRunMulti(
                datasetId, List.of(iterator(1, 2), idToNameLookup(true)), null, List.of("op-1"), null);
        assertThat(lookups).extracting(ModelOperationResult::name).containsExactly("0", "1");
        // The search moves to sheets B and C, but the value is always read from the configured sheet A.
        assertThat(lookups).extracting(ModelOperationResult::value).containsExactly("a", "a");
    }

    @Test
    void anIteratedModelGivesOneResultPerRoundWithAListOutputKeptIntact() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(
                iterator(0, 1), node("a", "5"), node("b", "1"),
                filterOf("f", Map.of("mode", "single", "operator", "gt", "value", literalInput("3")),
                        List.of(referenceInput("a"), referenceInput("b"))));

        List<ModelOperationResult> results = registerAndRunMulti(datasetId, operations, null, List.of("f"), null);

        // One result per round, named by the round, each holding the filter's whole list.
        assertThat(results).extracting(ModelOperationResult::name).containsExactly("0", "1");
        assertThat(results).extracting(ModelOperationResult::value).containsExactly(List.of("5"), List.of("5"));
        assertThat(results.get(0).labels()).containsExactly("a");
    }

    @Test
    void iteratorLeavesAnOperationOnItsOwnSheetUnlessItUsesTheIteratorsSheet() {
        String datasetId = twoSheetDataset();

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), idToNameLookup(false)), null, List.of("op-1"), null);

        assertThat(results).extracting(ModelOperationResult::value).containsExactly("Bruno", "Bruno");
    }

    @Test
    void iteratorExposesItsCurrentSheetToOperationsThatReferenceIt() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-1", "node", Map.of("input", referenceInput("op-iter")));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), node), null, List.of("op-1"), null);

        assertThat(results).extracting(ModelOperationResult::value).containsExactly("0", "1");
    }

    @Test
    void iteratorKeepsGoingAfterARoundFails() {
        String datasetId = twoSheetDataset();

        // "Livro" only exists on the orders sheet (1): on the clients sheet (0) the lookup finds
        // nothing, so the counter chained off it fails — round 0 fails, round 1 still runs.
        ModelOperationInput lookup = new ModelOperationInput("op-lookup", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Livro"),
                "sheetIndex", 0,
                "useIteratorSheet", true,
                "searchColumn", literalInput("1"),
                "resultColumn", 0));
        ModelOperationInput counter = new ModelOperationInput("op-1", "calc", Map.of(
                "inputs", List.of(referenceInput("op-lookup")), "operation", "add", "format", "none"));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), lookup, counter), null, List.of("op-1"), null);

        assertThat(results).extracting(ModelOperationResult::name).containsExactly("0", "1");
        assertThat(results.get(0).success()).isFalse();
        assertThat(results.get(0).error()).isNotBlank();
        assertThat(results.get(1).success()).isTrue();
        assertThat(results.get(1).value()).isEqualTo(1L);
    }

    @Test
    void rejectsAnIteratorRangeOutsideTheDatasetsSheets() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> registerAndRunMulti(
                datasetId, List.of(iterator(0, 2), idToNameLookup(true)), null, List.of("op-1"), null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> registerAndRunMulti(
                datasetId, List.of(iterator(1, 0), idToNameLookup(true)), null, List.of("op-1"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnIteratorModelWithMoreThanOneOutputOrMoreThanOneIterator() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), idToNameLookup(true)), null, List.of("op-1", "op-iter"), null))
                .isInstanceOf(IllegalArgumentException.class);

        ModelOperationInput secondIterator = new ModelOperationInput("op-iter-2", "iterator", Map.of("startSheet", 0, "endSheet", 1));
        assertThatThrownBy(() -> registerAndRunMulti(
                datasetId, List.of(iterator(0, 1), secondIterator, idToNameLookup(true)), null, List.of("op-1"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aModelWithoutAnIteratorStillReturnsOneNamedResultPerOutput() {
        String datasetId = twoSheetDataset();

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(idToNameLookup(true)), null, List.of("op-1"), null);

        // useIteratorSheet is ignored without an iterator: still the registered sheet 0.
        assertThat(results).hasSize(1);
        assertThat(results.get(0).id()).isEqualTo("op-1");
        assertThat(results.get(0).value()).isEqualTo("Bruno");
    }

    @Test
    void selectorReturnsTheInputAtTheZeroBasedIndex() {
        String datasetId = twoSheetDataset();

        ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                "index", literalInput("1"),
                "inputs", List.of(literalInput("a"), literalInput("b"), literalInput("c"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(selector), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("b");
    }

    @Test
    void selectorTakesItsIndexFromAnotherOperation() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-idx", "calc", Map.of(
                "inputs", List.of(literalInput("1"), literalInput("1")), "operation", "add", "format", "none"));
        ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                "index", Map.of("type", "reference", "operationId", "op-idx"),
                "inputs", List.of(literalInput("a"), literalInput("b"), literalInput("c"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter, selector), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("c");
    }

    @Test
    void selectorIgnoresABrokenInputItDidNotSelect() {
        String datasetId = twoSheetDataset();

        ModelOperationInput broken = new ModelOperationInput("op-broken", "calc", Map.of(
                "inputs", List.of(literalInput("not-a-number")), "operation", "add", "format", "none"));
        ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                "index", literalInput("0"),
                "inputs", List.of(literalInput("ok"), Map.of("type", "reference", "operationId", "op-broken"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(broken, selector), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("ok");
    }

    @Test
    void reportsASelectorIndexOutOfRangeOrNotWholeAsAnError() {
        String datasetId = twoSheetDataset();

        for (String badIndex : List.of("3", "-1", "1.5", "abc", "")) {
            ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                    "index", literalInput(badIndex),
                    "inputs", List.of(literalInput("a"), literalInput("b"), literalInput("c"))));

            ModelOperationResult result = registerAndRun(datasetId, List.of(selector), null, "op-1", null);

            assertThat(result.success()).as("index '%s'", badIndex).isFalse();
            assertThat(result.error()).isNotBlank();
        }
    }

    @Test
    void reportsASelectorWithNoInputsAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                "index", literalInput("0"), "inputs", List.of()));

        ModelOperationResult result = registerAndRun(datasetId, List.of(selector), null, "op-1", null);

        assertThat(result.success()).isFalse();
    }

    @Test
    void reportsACircularReferenceThroughASelectorsIndexAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput selector = new ModelOperationInput("op-1", "selector", Map.of(
                "index", Map.of("type", "reference", "operationId", "op-1"),
                "inputs", List.of(literalInput("a"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(selector), null, "op-1", null);

        assertThat(result.success()).isFalse();
    }

    @Test
    void reportsACalcWithNoInputsAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "calc", Map.of("inputs", List.of(), "operation", "add", "format", "none"));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsANonNumericCalcInputAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "calc", Map.of(
                "inputs", List.of(literalInput("not-a-number")), "operation", "add", "format", "none"));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsACircularReferenceThroughACalcsMultipleInputsAsAnError() {
        String datasetId = twoSheetDataset();

        // op-a's counter chains back to op-b, which chains back to op-a — a cycle reachable
        // through only one of the counter's two inputs, the other being a plain literal.
        ModelOperationInput opA = new ModelOperationInput("op-a", "calc", Map.of(
                "inputs", List.of(referenceInput("op-b"), literalInput("1")), "operation", "add", "format", "none"));
        ModelOperationInput opB = new ModelOperationInput("op-b", "calc", Map.of(
                "inputs", List.of(referenceInput("op-a")), "operation", "add", "format", "none"));

        ModelOperationResult result = registerAndRun(datasetId, List.of(opA, opB), null, "op-a", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void aNodeWithALiteralValuePassesItThroughAsItsResult() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-1", "node", Map.of("input", literalInput("Bruno")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
    }

    private ModelOperationInput formatter(String id, Map<String, Object> rules, String... appliesTo) {
        Map<String, Object> fields = new java.util.HashMap<>(rules);
        fields.put("appliesTo", List.of(appliesTo));
        return new ModelOperationInput(id, "formatter", fields);
    }

    @Test
    void aFormatterRefusesAnInputThatBreaksItsRulesAndTheOperationFailsWithTheReason() {
        String datasetId = twoSheetDataset();
        ModelOperationInput node = new ModelOperationInput("op-1", "node", Map.of("input", literalInput("")));
        ModelOperationInput rules = formatter("fmt", Map.of("type", "text", "maxLength", 5), "op-1");

        ModelOperationResult tooLong = registerAndRun(datasetId, List.of(node, rules), List.of("op-1"), "op-1", Map.of("op-1", "abcdef"));
        ModelOperationResult fine = registerAndRun(datasetId, List.of(node, rules), List.of("op-1"), "op-1", Map.of("op-1", "abcde"));

        assertThat(tooLong.success()).isFalse();
        assertThat(tooLong.error()).isEqualTo("At most 5 characters are allowed (it has 6).");
        assertThat(fine.success()).isTrue();
        assertThat(fine.value()).isEqualTo("abcde");
    }

    @Test
    void aFormatterWritesANumberCanonicallyAndTheFailureReachesWhatChainsOffIt() {
        String datasetId = twoSheetDataset();
        ModelOperationInput node = new ModelOperationInput("op-1", "node", Map.of("input", literalInput("")));
        ModelOperationInput next = new ModelOperationInput("op-2", "node", Map.of("input", referenceInput("op-1")));
        ModelOperationInput rules = formatter("fmt", Map.of("type", "integer", "min", 1, "max", 10), "op-1");
        List<ModelOperationInput> model = List.of(node, next, rules);

        ModelOperationResult ok = registerAndRun(datasetId, model, List.of("op-1"), "op-2", Map.of("op-1", " 007 "));
        ModelOperationResult notANumber = registerAndRun(datasetId, model, List.of("op-1"), "op-2", Map.of("op-1", "x"));

        assertThat(ok.success()).isTrue();
        assertThat(ok.value()).isEqualTo("7");
        assertThat(notANumber.success()).isFalse();
    }

    @Test
    void aFormatterOnlyTouchesTheOperationsItAppliesTo() {
        String datasetId = twoSheetDataset();
        ModelOperationInput governed = new ModelOperationInput("op-1", "node", Map.of("input", literalInput("")));
        ModelOperationInput free = new ModelOperationInput("op-2", "node", Map.of("input", literalInput("")));
        ModelOperationInput rules = formatter("fmt", Map.of("type", "text", "required", true), "op-1");

        List<ModelOperationResult> results = registerAndRunMulti(datasetId, List.of(governed, free, rules),
                List.of("op-1", "op-2"), List.of("op-1", "op-2"), Map.of("op-1", "", "op-2", ""));

        assertThat(results.get(0).success()).isFalse();
        assertThat(results.get(0).error()).isEqualTo("A value is required.");
        assertThat(results.get(1).success()).isTrue();
    }

    @Test
    void aModelsInputsSayWhichRulesAFormatterPutsOnThem() {
        String datasetId = twoSheetDataset();
        ModelOperationInput governed = new ModelOperationInput("op-1", "node", Map.of("input", literalInput("")));
        ModelOperationInput free = new ModelOperationInput("op-2", "node", Map.of("input", literalInput("")));
        ModelOperationInput rules = formatter("fmt", Map.of("type", "decimal", "min", 0.5, "required", true), "op-1");
        String modelId = modelExecutionService.registerModel(datasetId,
                new ModelRegisterRequest("M", List.of(governed, free, rules), List.of("op-1", "op-2"), List.of("op-1")));

        var inputs = modelExecutionService.getModelInputs(modelId).inputs();

        assertThat(inputs.get(0).format().type()).isEqualTo("decimal");
        assertThat(inputs.get(0).format().required()).isTrue();
        assertThat(inputs.get(0).format().min()).isEqualByComparingTo("0.5");
        assertThat(inputs.get(1).format()).isNull();
    }

    @Test
    void aNodesValueCanBeChainedIntoAnotherOperationsInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", literalInput("Bruno")));
        ModelOperationInput lookup = new ModelOperationInput("op-lookup", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-node"),
                "sheetIndex", 0,
                "searchColumn", literalInput("1"),
                "resultColumn", 0));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node, lookup), null, "op-lookup", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("2");
    }

    @Test
    void aFindOperationReportsThePositionOfItsMatchAsItsResult() {
        String datasetId = twoSheetDataset();

        ModelOperationInput find = new ModelOperationInput("op-1", "find", Map.of(
                "input", literalInput("Bruno"),
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));

        ModelOperationResult result = registerAndRun(datasetId, List.of(find), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("1,1");
    }

    @Test
    void aFindOperationWithReturnValueReportsTheMatchedCellsValueInsteadOfItsPosition() {
        String datasetId = twoSheetDataset();

        ModelOperationInput find = new ModelOperationInput("op-1", "find", Map.of(
                "input", literalInput("bruno"),
                "sheetIndex", 0,
                "returnValue", true,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));

        ModelOperationResult result = registerAndRun(datasetId, List.of(find), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
    }

    private ModelOperationInput node(String id, String value) {
        return new ModelOperationInput(id, "node", Map.of("input", literalInput(value)), id);
    }

    private ModelOperationInput translatorOf(String id, List<Map<String, Object>> inputs) {
        return new ModelOperationInput(id, "translator", Map.of(
                "inputs", inputs,
                "rules", List.of(
                        Map.of("from", "0", "to", "0"), Map.of("from", "1", "to", "0"),
                        Map.of("from", "2", "to", "0"), Map.of("from", "3", "to", "1"))), id);
    }

    private Map<String, Object> outputRef(String id, int index) {
        return Map.of("type", "reference", "operationId", id, "outputIndex", index);
    }

    @Test
    void aTranslatorWithSeveralInputsTranslatesEachAndACalcCanAddItsOutputs() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(
                node("a", "3"), node("b", "2"), node("c", "3"),
                translatorOf("t", List.of(referenceInput("a"), referenceInput("b"), referenceInput("c"))),
                new ModelOperationInput("sum", "calc", Map.of("inputs", List.of(
                        outputRef("t", 0), outputRef("t", 1), outputRef("t", 2)), "operation", "add", "format", "none"), "sum"));

        ModelOperationResult result = registerAndRun(datasetId, operations, null, "sum", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(2L);
    }

    @Test
    void aTranslatorWithSeveralInputsAsAModelOutputIsOneResultHoldingAListNamedAfterItsInputs() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(
                node("a", "3"), node("b", "2"), node("c", "1"),
                translatorOf("t", List.of(referenceInput("a"), referenceInput("b"), referenceInput("c"))));

        List<ModelOperationResult> results = registerAndRunMulti(datasetId, operations, null, List.of("t"), null);

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.value()).isEqualTo(List.of("1", "0", "0"));
            assertThat(result.labels()).containsExactly("a", "b", "c");
            assertThat(result.name()).isEqualTo("t");
        });
    }

    @Test
    void referencingAMultiOutputTranslatorWithoutChoosingAnOutputFails() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(
                node("a", "3"), node("b", "2"),
                translatorOf("t", List.of(referenceInput("a"), referenceInput("b"))),
                new ModelOperationInput("n", "node", Map.of("input", referenceInput("t")), "n"));

        ModelOperationResult result = registerAndRun(datasetId, operations, null, "n", null);

        assertThat(result.success()).isFalse();
    }

    private ModelOperationInput filterOf(String id, Map<String, Object> condition, List<Map<String, Object>> inputs) {
        Map<String, Object> fields = new java.util.HashMap<>(condition);
        fields.put("inputs", inputs);
        return new ModelOperationInput(id, "filter", fields, id);
    }

    @Test
    void aFilterAsAModelOutputIsOneResultHoldingOnlyTheInputsThatMeetTheCondition() {
        List<ModelOperationInput> operations = List.of(
                node("a", "5"), node("b", "1"), node("c", "abc"), node("d", "7"),
                filterOf("f", Map.of("mode", "single", "operator", "gt", "value", literalInput("3")),
                        List.of(referenceInput("a"), referenceInput("b"), referenceInput("c"), referenceInput("d"))));

        List<ModelOperationResult> results = registerAndRunMulti(null, operations, null, List.of("f"), null);

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.value()).isEqualTo(List.of("5", "7"));
            assertThat(result.labels()).containsExactly("a", "d");
            assertThat(result.name()).isEqualTo("f");
        });
    }

    @Test
    void aFilterThatKeepsOneInputOrNoneStillHoldsAList() {
        List<ModelOperationInput> one = List.of(
                node("a", "5"), node("b", "1"),
                filterOf("f", Map.of("mode", "single", "operator", "gt", "value", literalInput("3")),
                        List.of(referenceInput("a"), referenceInput("b"))));
        assertThat(registerAndRunMulti(null, one, null, List.of("f"), null)).singleElement().satisfies(result -> {
            assertThat(result.value()).isEqualTo(List.of("5"));
            assertThat(result.labels()).containsExactly("a");
        });

        List<ModelOperationInput> none = List.of(
                node("a", "1"),
                filterOf("f", Map.of("mode", "single", "operator", "gt", "value", literalInput("3")),
                        List.of(referenceInput("a"))),
                new ModelOperationInput("n", "node", Map.of("input", referenceInput("f")), "n"));
        assertThat(registerAndRunMulti(null, none, null, List.of("f"), null)).singleElement().satisfies(result -> {
            assertThat(result.success()).isTrue();
            assertThat(result.value()).isEqualTo(List.of());
        });
        // Nothing to read from it: a reference to a filter that kept nothing fails.
        assertThat(registerAndRun(null, none, null, "n", null).success()).isFalse();
    }

    @Test
    void aFilterRangeIsInclusiveAndItsLimitsCanBeDynamic() {
        List<ModelOperationInput> operations = List.of(
                node("a", "10"), node("limit", "10"),
                filterOf("f", Map.of("mode", "range", "min", literalInput("1"), "max", referenceInput("limit")),
                        List.of(referenceInput("a"))));

        ModelOperationResult result = registerAndRun(null, operations, null, "f", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(List.of("10"));
    }

    @Test
    void aFilterRangeWithAnEmptyLimitHasNoLimitThere() {
        List<ModelOperationInput> operations = List.of(
                node("a", "1000"),
                filterOf("f", Map.of("mode", "range", "min", literalInput("5"), "max", literalInput("")),
                        List.of(referenceInput("a"))));

        assertThat(registerAndRun(null, operations, null, "f", null).success()).isTrue();
    }

    @Test
    void aFilterTextConditionIgnoresCase() {
        List<ModelOperationInput> operations = List.of(
                node("a", "Lisboa Norte"),
                filterOf("f", Map.of("mode", "single", "operator", "startsWith", "value", literalInput("lisboa")),
                        List.of(referenceInput("a"))));

        assertThat(registerAndRun(null, operations, null, "f", null).success()).isTrue();
    }

    private ModelOperationInput combinedOf(String id, Map<String, Object> first, Map<String, Object> second) {
        return new ModelOperationInput(id, "combined", Map.of("first", first, "second", second), id);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> part(ModelOperationResult result, String key) {
        return (Map<String, Object>) ((Map<String, Object>) result.value()).get(key);
    }

    @Test
    void aCombinedOutputMergesAnEvaluationAndAWholeListIntoOneResult() {
        List<ModelOperationInput> operations = List.of(
                node("a", "5"), node("b", "1"), node("c", "7"), node("sum", "3"),
                translatorOf("t", List.of(referenceInput("sum"))),
                filterOf("f", Map.of("mode", "single", "operator", "gt", "value", literalInput("3")),
                        List.of(referenceInput("a"), referenceInput("b"), referenceInput("c"))),
                combinedOf("combined", referenceInput("t"), referenceInput("f")));

        List<ModelOperationResult> results = registerAndRunMulti(null, operations, null, List.of("combined"), null);

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.success()).isTrue();
            assertThat(result.name()).isEqualTo("combined");
            assertThat(part(result, "first").get("value")).isEqualTo("1");
            assertThat(part(result, "second").get("value")).isEqualTo(List.of("5", "7"));
            assertThat(part(result, "second").get("labels")).isEqualTo(List.of("a", "c"));
        });
    }

    @Test
    void aCombinedOutputTakesTypedValuesAndASingleOutputToo() {
        List<ModelOperationInput> operations = List.of(
                node("a", "3"), node("b", "2"),
                translatorOf("t", List.of(referenceInput("a"), referenceInput("b"))),
                combinedOf("combined", literalInput("Borderline"), outputRef("t", 1)));

        ModelOperationResult result = registerAndRun(twoSheetDataset(), operations, null, "combined", null);

        assertThat(part(result, "first").get("value")).isEqualTo("Borderline");
        assertThat(part(result, "second").get("value")).isEqualTo("0");
    }

    @Test
    void aCombinedOutputFailsWhenOneOfItsInputsFailsAndCannotBeReferenced() {
        List<ModelOperationInput> broken = List.of(
                combinedOf("combined", literalInput("x"), referenceInput("missing")));
        assertThat(registerAndRun(null, broken, null, "combined", null).success()).isFalse();

        List<ModelOperationInput> chained = List.of(
                combinedOf("combined", literalInput("x"), literalInput("y")),
                new ModelOperationInput("n", "node", Map.of("input", referenceInput("combined")), "n"));
        ModelOperationResult result = registerAndRun(null, chained, null, "n", null);
        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("combined output");
    }

    private ModelOperationResult runCalc(String operation, String format, String a, String b) {
        return runCalcOver(operation, format, a, b);
    }

    @Test
    void aCalcOperationDoesArithmeticOnItsTwoInputs() {
        assertThat(runCalc("add", "none", "2", "3.5").value()).isEqualTo(5.5);
        assertThat(runCalc("subtract", "none", "2", "5").value()).isEqualTo(-3L);
        assertThat(runCalc("multiply", "none", "4", "2,5").value()).isEqualTo(10L);
        assertThat(runCalc("divide", "none", "9", "2").value()).isEqualTo(4.5);
    }

    @Test
    void aCalcOperationCanRoundItsResultToAnIntegerOrTakeItsAbsoluteValue() {
        assertThat(runCalc("divide", "round", "10", "4").value()).isEqualTo(3L);
        assertThat(runCalc("subtract", "abs", "2", "5").value()).isEqualTo(3L);
    }

    @Test
    void aCalcOperationFailsOnDivisionByZeroOrANonNumber() {
        assertThat(runCalc("divide", "none", "1", "0").success()).isFalse();
        assertThat(runCalc("add", "none", "x", "1").success()).isFalse();
    }

    /** A calc made with a list of inputs (any number of them), each a node holding the given value. */
    private ModelOperationResult runCalcOver(String operation, String format, String... values) {
        List<ModelOperationInput> operations = new java.util.ArrayList<>();
        List<Object> inputs = new java.util.ArrayList<>();
        for (int index = 0; index < values.length; index++) {
            operations.add(node("n" + index, values[index]));
            inputs.add(referenceInput("n" + index));
        }
        operations.add(new ModelOperationInput("calc", "calc", Map.of("inputs", inputs, "operation", operation, "format", format), "calc"));
        return registerAndRun(twoSheetDataset(), operations, null, "calc", null);
    }

    @Test
    void aCalcWithAListOfInputsAddsOrMultipliesAllOfThem() {
        assertThat(runCalcOver("add", "none", "2", "3.5", "10").value()).isEqualTo(15.5);
        assertThat(runCalcOver("multiply", "none", "2", "3", "4").value()).isEqualTo(24L);
        assertThat(runCalcOver("add", "none", "7").value()).isEqualTo(7L);
    }

    @Test
    void aCalcWithAListOfInputsSubtractsOrDividesTheRestFromTheFirstInOrder() {
        assertThat(runCalcOver("subtract", "none", "100", "10", "5").value()).isEqualTo(85L);
        assertThat(runCalcOver("divide", "none", "100", "5", "2").value()).isEqualTo(10L);
        assertThat(runCalcOver("subtract", "abs", "2", "5", "1").value()).isEqualTo(4L);
    }

    @Test
    void aCalcWithAListOfInputsNeedsTwoToSubtractOrDivideAndRefusesZeroDivisionAndNonNumbers() {
        assertThat(runCalcOver("subtract", "none", "5").success()).isFalse();
        assertThat(runCalcOver("divide", "none", "5").success()).isFalse();
        assertThat(runCalcOver("divide", "none", "8", "2", "0").success()).isFalse();
        assertThat(runCalcOver("add", "none", "1", "x").success()).isFalse();
    }

    /** What the two ways of writing the same calculation must agree on, for every operation and format. */
    @Test
    void aCalcWithAListSaysWhichInputIsEmptyOrNotANumber() {
        assertThat(runCalcOver("add", "none", "1", "").error()).contains("Input 2 has no value");
        assertThat(runCalcOver("add", "none", "1", "x").error()).contains("input 2");
    }

    @Test
    void aCalcWhoseInputsReferenceItselfFailsInsteadOfHanging() {
        ModelOperationInput calc = new ModelOperationInput("calc", "calc", Map.of(
                "inputs", List.of(referenceInput("calc"), literalInput("1")), "operation", "add", "format", "none"), "calc");

        assertThat(registerAndRun(twoSheetDataset(), List.of(calc), null, "calc", null).success()).isFalse();
    }

    private ModelOperationInput findCaneta() {
        return new ModelOperationInput("find", "find", Map.of(
                "input", literalInput("Caneta"),
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)), "find");
    }

    @Test
    void aPageSelectorMakesEverySheetBasedOperationReadFromThePageItPicks() {
        String datasetId = twoSheetDataset();
        ModelOperationInput page = new ModelOperationInput("page", "page", Map.of("input", literalInput("1")), "page");

        // "Caneta" is only on the second sheet: found there because the selector picked it, although
        // the find was set up against the first one — and not found without a selector.
        assertThat(registerAndRun(datasetId, List.of(page, findCaneta()), null, "find", null).value()).isEqualTo("1,1");
        assertThat(registerAndRun(datasetId, List.of(findCaneta()), null, "find", null).value()).isNull();
    }

    @Test
    void aLookupFollowsThePageSelectorForSearchAndValueUnlessItKeepsItsOriginalPage() {
        String datasetId = twoSheetDataset();
        ModelOperationInput page = new ModelOperationInput("page", "page", Map.of("input", literalInput("1")), "page");

        // Looks up the id "2" in column 0 and returns column 1: "Bruno" on the first sheet, "Caneta" on the second.
        Map<String, Object> following = new java.util.HashMap<>(Map.of(
                "input", literalInput("2"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1,
                "startRow", literalInput("0"), "matchMode", "equals"));
        Map<String, Object> keeping = new java.util.HashMap<>(following);
        keeping.put("keepOriginalResultPage", true);

        assertThat(registerAndRun(datasetId, List.of(page, new ModelOperationInput("l", "lookup", following, "l")), null, "l", null).value())
                .isEqualTo("Caneta");
        assertThat(registerAndRun(datasetId, List.of(page, new ModelOperationInput("l", "lookup", keeping, "l")), null, "l", null).value())
                .isEqualTo("Bruno");
    }

    @Test
    void aPageSelectorFedByAnOperationThatFollowsItIsACycle() {
        String datasetId = twoSheetDataset();
        ModelOperationInput page = new ModelOperationInput("page", "page", Map.of("input", referenceInput("find")), "page");

        ModelOperationResult result = registerAndRun(datasetId, List.of(page, findCaneta()), null, "find", null);

        assertThat(result.success()).isFalse();
    }

    @Test
    void aModelWithTwoPageSelectorsIsRejected() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(
                new ModelOperationInput("p1", "page", Map.of("input", literalInput("0")), "p1"),
                new ModelOperationInput("p2", "page", Map.of("input", literalInput("1")), "p2"));

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> registerAndRun(datasetId, operations, null, "p1", null));
    }

    @Test
    void aPageSelectorReportsItsIndexAndRejectsAPageTheDatasetDoesNotHave() {
        String datasetId = twoSheetDataset();

        ModelOperationResult ok = registerAndRun(datasetId,
                List.of(new ModelOperationInput("page", "page", Map.of("input", literalInput("1")), "page")), null, "page", null);
        ModelOperationResult outOfRange = registerAndRun(datasetId,
                List.of(new ModelOperationInput("page", "page", Map.of("input", literalInput("5")), "page")), null, "page", null);

        assertThat(ok.value()).isEqualTo(1);
        assertThat(outOfRange.success()).isFalse();
    }

    @Test
    void aFindOperationWithNoMatchInItsRangeReportsANullResultWithoutError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput find = new ModelOperationInput("op-1", "find", Map.of(
                "input", literalInput("does-not-exist"),
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));

        ModelOperationResult result = registerAndRun(datasetId, List.of(find), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isNull();
    }

    @Test
    void aFindOperationsQueryCanBeChainedFromAnotherOperationsResult() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", literalInput("Carla")));
        ModelOperationInput find = new ModelOperationInput("op-find", "find", Map.of(
                "input", referenceInput("op-node"),
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node, find), null, "op-find", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("2,1");
    }

    @Test
    void aLookupsSearchColumnCanBeChainedFromAFindOperationsResult() {
        String datasetId = twoSheetDataset();

        // find locates "Carla" within the whole table — she's in column 1 (the name column), row 2.
        ModelOperationInput find = new ModelOperationInput("op-find", "find", Map.of(
                "input", literalInput("Carla"),
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));
        // The lookup searches whichever column find landed on (1, parsed out of find's "2,1"
        // result) for "Carla" again, then reads the id from column 0 of the matching row.
        ModelOperationInput lookup = new ModelOperationInput("op-lookup", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Carla"),
                "sheetIndex", 0,
                "searchColumn", referenceInput("op-find"),
                "resultColumn", 0));

        ModelOperationResult result = registerAndRun(datasetId, List.of(find, lookup), null, "op-lookup", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("3");
    }

    @Test
    void aLookupsSearchColumnCanBeAPlainTypedNumberAsBefore() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Bruno"),
                "sheetIndex", 0,
                "searchColumn", literalInput("1"),
                "resultColumn", 0));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("2");
    }

    @Test
    void reportsALookupWithANonNumericDynamicSearchColumnAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", literalInput("not-a-column")));
        ModelOperationInput lookup = new ModelOperationInput("op-lookup", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Bruno"),
                "sheetIndex", 0,
                "searchColumn", referenceInput("op-node"),
                "resultColumn", 0));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node, lookup), null, "op-lookup", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void detectsACircularReferenceReachedOnlyThroughALookupsSearchColumnField() {
        String datasetId = twoSheetDataset();

        // op-a's searchColumn chains to op-b, whose own searchColumn chains back to op-a — a
        // cycle reachable only through searchColumn, not through either one's "input" query.
        ModelOperationInput opA = new ModelOperationInput("op-a", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("x"), "sheetIndex", 0, "searchColumn", referenceInput("op-b"), "resultColumn", 0));
        ModelOperationInput opB = new ModelOperationInput("op-b", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("x"), "sheetIndex", 0, "searchColumn", referenceInput("op-a"), "resultColumn", 0));

        ModelOperationResult result = registerAndRun(datasetId, List.of(opA, opB), null, "op-a", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    /** "X" appears twice (rows 0 and 2) — the fixture every startRow test below skips past the
     * first occurrence of to prove startRow actually took effect, not just coincidence. */
    private String duplicateValueDataset() {
        SheetData sheet = new SheetData("Vendas", 3, List.of(
                new RowData(0, List.of(new CellData(0, "X"), new CellData(1, "A"))),
                new RowData(1, List.of(new CellData(0, "Y"), new CellData(1, "Z"))),
                new RowData(2, List.of(new CellData(0, "X"), new CellData(1, "B")))
        ));
        return storeDataset(new DatasetImportResponse("dataset-lookup-startrow", "test.xlsx", Instant.now(), List.of(sheet)));
    }

    @Test
    void aLookupWithNoStartRowStillMatchesFromTheBeginning() {
        String datasetId = duplicateValueDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("X"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("A");
    }

    @Test
    void aLookupsStartRowSkipsEveryRowBeforeIt() {
        String datasetId = duplicateValueDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("1"),
                "input", literalInput("X"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("B");
    }

    @Test
    void aLookupsStartRowCanBeChainedFromAFindOperationsRowResult() {
        String datasetId = duplicateValueDataset();

        // find locates "Y" (the unique row-1 marker) — its combined result is "1,0"; the lookup's
        // startRow chains off it and, per parseRowIndex, takes the part *before* the comma (the
        // row, 1), not the column find itself used (0) — proving it reads the row half, not
        // reusing searchColumn's own column-half parsing.
        ModelOperationInput find = new ModelOperationInput("op-find", "find", Map.of(
                "input", literalInput("Y"), "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 2, "startColumn", 0, "endColumn", 1)));
        ModelOperationInput lookup = new ModelOperationInput("op-lookup", "lookup", Map.of(
                "startRow", referenceInput("op-find"),
                "input", literalInput("X"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(find, lookup), null, "op-lookup", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("B");
    }

    @Test
    void reportsALookupWithANonNumericStartRowAsAnError() {
        String datasetId = duplicateValueDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("not-a-row"),
                "input", literalInput("X"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void aLookupsStartRowSkipsARowEvenWhenItWouldOtherwiseHaveMatched() {
        String datasetId = duplicateValueDataset();

        // startRow past every row — even the second "X" (row 2) no longer qualifies.
        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("3"),
                "input", literalInput("X"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(lookup), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isNull();
    }

    @Test
    void aModelCanHaveSeveralDesignatedInputsEachOverriddenIndependentlyAtRunTime() {
        String datasetId = twoSheetDataset();

        ModelOperationInput nodeA = new ModelOperationInput("op-a", "node", Map.of("input", literalInput("unused-a")));
        ModelOperationInput nodeB = new ModelOperationInput("op-b", "node", Map.of("input", literalInput("unused-b")));
        // The output chains through a counter that adds both nodes' (overridden) values together —
        // this is the whole point of allowing more than one designated input: a caller fills in
        // two separate values, not just one.
        ModelOperationInput counter = new ModelOperationInput("op-counter", "calc", Map.of(
                "inputs", List.of(referenceInput("op-a"), referenceInput("op-b")), "operation", "add", "format", "none"));

        String modelId = modelExecutionService.registerModel(datasetId, new ModelRegisterRequest(
                "Test model", List.of(nodeA, nodeB, counter), List.of("op-a", "op-b"), List.of("op-counter")));

        ModelOperationResult result = modelExecutionService.runModel(
                datasetId, modelId, Map.of("op-a", "10", "op-b", "5")).get(0);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(15L);
    }

    @Test
    void treatsAMissingEntryForOneOfSeveralDesignatedInputsAsAnEmptyString() {
        String datasetId = twoSheetDataset();

        ModelOperationInput nodeA = new ModelOperationInput("op-a", "node", Map.of("input", literalInput("unused")));
        ModelOperationInput nodeB = new ModelOperationInput("op-b", "node", Map.of("input", literalInput("unused")));

        String modelId = modelExecutionService.registerModel(datasetId, new ModelRegisterRequest(
                "Test model", List.of(nodeA, nodeB), List.of("op-a", "op-b"), List.of("op-b")));

        // Only op-a's value is supplied; op-b (also a designated input) gets no entry, so its
        // node passes through an empty string rather than the literal it was registered with.
        ModelOperationResult result = modelExecutionService.runModel(datasetId, modelId, Map.of("op-a", "10")).get(0);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("");
    }

    @Test
    void rejectsRegisteringAModelWhoseInputsIncludeAnUnknownOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, List.of("does-not-exist"), List.of("op-1"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aModelCanHaveSeveralDesignatedOutputsEachReturnedSeparately() {
        String datasetId = twoSheetDataset();

        ModelOperationInput findAna = new ModelOperationInput("op-a", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Ana"), "sheetIndex", 0, "searchColumn", literalInput("1"), "resultColumn", 0));
        ModelOperationInput findBruno = new ModelOperationInput("op-b", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("Bruno"), "sheetIndex", 0, "searchColumn", literalInput("1"), "resultColumn", 0));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(findAna, findBruno), null, List.of("op-a", "op-b"), null);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).id()).isEqualTo("op-a");
        assertThat(results.get(0).value()).isEqualTo("1");
        assertThat(results.get(1).id()).isEqualTo("op-b");
        assertThat(results.get(1).value()).isEqualTo("2");
    }

    @Test
    void reusesAResultAcrossSeveralOutputsThatShareAChainedDependency() {
        String datasetId = twoSheetDataset();

        // op-id and op-order both sit on the same chain (op-order depends on op-id, which depends
        // on op-node) — naming both as separate outputs must compute op-node and op-id once each
        // and reuse them, per the shared resolution cache, not recompute per output.
        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", literalInput("Bruno")));
        ModelOperationInput findId = new ModelOperationInput("op-id", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-node"), "sheetIndex", 0, "searchColumn", literalInput("1"), "resultColumn", 0));
        ModelOperationInput findOrder = new ModelOperationInput("op-order", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("op-id"), "sheetIndex", 1, "searchColumn", literalInput("0"), "resultColumn", 1));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(node, findId, findOrder), null, List.of("op-id", "op-order"), null);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).value()).isEqualTo("2");
        assertThat(results.get(1).value()).isEqualTo("Caneta");
    }

    @Test
    void oneOutputsErrorDoesNotStopAnotherOutputFromResolving() {
        String datasetId = twoSheetDataset();

        ModelOperationInput broken = new ModelOperationInput("op-broken", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", referenceInput("does-not-exist"), "sheetIndex", 0, "searchColumn", literalInput("0"), "resultColumn", 1));
        ModelOperationInput sum = new ModelOperationInput("op-sum", "calc", Map.of("inputs", List.of(literalInput("1")), "operation", "add", "format", "none"));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(broken, sum), null, List.of("op-broken", "op-sum"), null);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).success()).isFalse();
        assertThat(results.get(1).success()).isTrue();
    }

    @Test
    void rejectsRegisteringAModelWhoseOutputsIncludeAnUnknownOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(datasetId, new ModelRegisterRequest(
                "Test model", operations, null, List.of("op-1", "does-not-exist"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRegisteringAModelWithAnEmptyOutputList() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of())))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownModelIdWhenRunning() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> modelExecutionService.runModel(datasetId, "missing-model", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRunningAModelAgainstADifferentDatasetThanItWasRegisteredFor() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("op-1")));

        String otherDatasetId = storeDataset(
                new DatasetImportResponse("dataset-other", "other.xlsx", Instant.now(), List.of()));

        assertThatThrownBy(() -> modelExecutionService.runModel(otherDatasetId, modelId, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private List<Map<String, Object>> translatorRules(String... fromTo) {
        List<Map<String, Object>> rules = new ArrayList<>();
        for (int i = 0; i < fromTo.length; i += 2) {
            rules.add(Map.of("from", fromTo[i], "to", fromTo[i + 1]));
        }
        return rules;
    }

    private Map<String, Object> rangeRule(String min, String max, String to) {
        Map<String, Object> rule = new java.util.HashMap<>();
        rule.put("min", min);
        rule.put("max", max);
        rule.put("to", to);
        return rule;
    }

    /** The ASEBA "Ansiedade / depressão" bands: up to 8 normative, 9 to 13 borderline, above 13 clinical. */
    private ModelOperationInput rangeTranslator(String input) {
        return new ModelOperationInput("t", "translator", Map.of(
                "type", "range",
                "inputs", List.of(literalInput(input)),
                "rules", List.of(rangeRule("", "8", "Normativo"), rangeRule("9", "13", "Borderline"), rangeRule("13.5", null, "Clínico"))));
    }

    @Test
    void aRangeTranslatorPicksTheIntervalThatContainsTheValue() {
        assertThat(registerAndRun(null, List.of(rangeTranslator("5")), null, "t", null).value()).isEqualTo("Normativo");
        assertThat(registerAndRun(null, List.of(rangeTranslator("8")), null, "t", null).value()).isEqualTo("Normativo");
        assertThat(registerAndRun(null, List.of(rangeTranslator("9")), null, "t", null).value()).isEqualTo("Borderline");
        assertThat(registerAndRun(null, List.of(rangeTranslator("13")), null, "t", null).value()).isEqualTo("Borderline");
        assertThat(registerAndRun(null, List.of(rangeTranslator("23,5")), null, "t", null).value()).isEqualTo("Clínico");
    }

    @Test
    void aRangeTranslatorReportsAValueNoIntervalContainsOrThatIsNotANumber() {
        ModelOperationResult gap = registerAndRun(null, List.of(rangeTranslator("13.2")), null, "t", null);
        assertThat(gap.success()).isFalse();
        assertThat(gap.error()).contains("No range contains");

        ModelOperationResult text = registerAndRun(null, List.of(rangeTranslator("abc")), null, "t", null);
        assertThat(text.success()).isFalse();
        assertThat(text.error()).contains("not a number");
    }

    @Test
    void aRangeTranslatorRefusesOverlappingOrBoundlessIntervals() {
        ModelOperationInput overlapping = new ModelOperationInput("t", "translator", Map.of(
                "type", "range", "inputs", List.of(literalInput("5")),
                "rules", List.of(rangeRule("1", "5", "a"), rangeRule("5", "9", "b"))));
        assertThat(registerAndRun(null, List.of(overlapping), null, "t", null).error()).contains("overlap");

        ModelOperationInput boundless = new ModelOperationInput("t", "translator", Map.of(
                "type", "range", "inputs", List.of(literalInput("5")), "rules", List.of(rangeRule("", "", "a"))));
        assertThat(registerAndRun(null, List.of(boundless), null, "t", null).error()).contains("no bounds");

        ModelOperationInput inverted = new ModelOperationInput("t", "translator", Map.of(
                "type", "range", "inputs", List.of(literalInput("5")), "rules", List.of(rangeRule("9", "1", "a"))));
        assertThat(registerAndRun(null, List.of(inverted), null, "t", null).error()).contains("above where it ends");
    }

    @Test
    void aTranslatorWithoutATypeIsStillAFixedOne() {
        ModelOperationInput translator = new ModelOperationInput("t", "translator", Map.of(
                "inputs", List.of(literalInput("6")), "rules", translatorRules("6", "2")));
        assertThat(registerAndRun(null, List.of(translator), null, "t", null).value()).isEqualTo("2");
    }

    @Test
    void aTranslatorOperationTranslatesALiteralInputThroughItsRules() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "inputs", List.of(literalInput("6")),
                "rules", translatorRules("3", "1", "4", "1", "5", "1", "6", "2")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(translator), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("2");
    }

    @Test
    void aTranslatorOperationCanTranslateAChainedInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput node = new ModelOperationInput("op-node", "node", Map.of("input", literalInput("3")));
        ModelOperationInput translator = new ModelOperationInput("op-translator", "translator", Map.of(
                "inputs", List.of(referenceInput("op-node")),
                "rules", translatorRules("3", "1", "6", "2")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node, translator), null, "op-translator", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("1");
    }

    @Test
    void aTranslatorOperationWithNoMatchingRuleReportsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "inputs", List.of(literalInput("does-not-exist")),
                "rules", translatorRules("3", "1")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(translator), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void aTranslatorOperationWithDuplicateSourceRulesReportsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "inputs", List.of(literalInput("3")),
                "rules", translatorRules("3", "1", "3", "2")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(translator), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void deletesARegisteredModelSoItCanNoLongerBeRun() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("op-1")));

        modelExecutionService.deleteModel(datasetId, modelId);

        assertThatThrownBy(() -> modelExecutionService.runModel(datasetId, modelId, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDeletingAnUnknownModelId() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> modelExecutionService.deleteModel(datasetId, "missing-model"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDeletingAModelThatBelongsToADifferentDataset() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "find", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("op-1")));

        String otherDatasetId = storeDataset(
                new DatasetImportResponse("dataset-other", "other.xlsx", Instant.now(), List.of()));

        assertThatThrownBy(() -> modelExecutionService.deleteModel(otherDatasetId, modelId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void describesOnlyTheDesignatedInputsAndNamesOutputsOnRun() {
        String datasetId = twoSheetDataset();
        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "startRow", literalInput("0"),
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", literalInput("0"),
                "resultColumn", 1), "Client id");
        ModelOperationInput internal = new ModelOperationInput("op-2", "lookup", Map.of(
                "input", referenceInput("op-1"), "sheetIndex", 1), "Internal step");
        ModelOperationInput output = new ModelOperationInput("op-3", "lookup", Map.of(
                "input", referenceInput("op-2"), "sheetIndex", 1), "Product");
        String modelId = modelExecutionService.registerModel(datasetId, new ModelRegisterRequest(
                "Test model", List.of(lookup, internal, output), List.of("op-1"), List.of("op-3")));

        ModelInputsResponse io = modelExecutionService.getModelInputs(modelId);

        assertThat(io.inputs()).singleElement().satisfies(input -> {
            assertThat(input.id()).isEqualTo("op-1");
            assertThat(input.name()).isEqualTo("Client id");
            assertThat(input.kind()).isEqualTo("lookup");
            assertThat(input.value()).isEqualTo("2");
        });
        assertThat(modelExecutionService.runModel(datasetId, modelId, Map.of("op-1", "2")))
                .singleElement()
                .satisfies(result -> {
                    assertThat(result.id()).isEqualTo("op-3");
                    assertThat(result.name()).isEqualTo("Product");
                });
    }

    @Test
    void rejectsDescribingAnUnknownModel() {
        assertThatThrownBy(() -> modelExecutionService.getModelInputs("missing-model"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
