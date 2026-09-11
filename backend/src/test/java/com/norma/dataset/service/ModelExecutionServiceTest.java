package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
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
    void runsASumOperation() {
        SheetData sales = new SheetData("Vendas", 2, List.of(
                new RowData(0, List.of(new CellData(0, 10L))),
                new RowData(1, List.of(new CellData(0, 5L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-model-sum", "test.xlsx", Instant.now(), List.of(sales)));

        ModelOperationInput sum = new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 1, "startColumn", 0, "endColumn", 0)));

        ModelOperationResult result = registerAndRun(datasetId, List.of(sum), null, "op-1", null);

        assertThat(result.success()).isTrue();
        // A whole-number sum normalizes to a Long, same as a whole-number cell value already does
        // (see OperationSupport.normalizeNumber) — so a downstream reference to it stringifies
        // as "15", not "15.0", matching cells the same way the frontend's own testing does.
        assertThat(result.value()).isEqualTo(15L);
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
    void chainsAWholeNumberSumsResultIntoALookupsInputWithoutATrailingDecimal() {
        SheetData clients = new SheetData("Clientes", 3, List.of(
                new RowData(0, List.of(new CellData(0, 10L), new CellData(1, "Ana"))),
                new RowData(1, List.of(new CellData(0, 15L), new CellData(1, "Bruno")))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-sum-lookup-chain", "test.xlsx", Instant.now(), List.of(clients)));

        // Sums to a whole number (15) that must match a Long-typed cell's own "15" — a naive
        // String.valueOf(Double) on the raw sum would instead produce "15.0" and never match.
        ModelOperationInput sum = new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0,
                "range", Map.of("startRow", 1, "endRow", 1, "startColumn", 0, "endColumn", 0)));
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
        ModelOperationInput sum = new ModelOperationInput("op-2", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0)));

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
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRegisteringAModelWhoseOutputDoesNotMatchAnyOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("does-not-exist"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownDatasetIdWhenRegisteringAModel() {
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(
                "missing-dataset", new ModelRegisterRequest("Test model", operations, null, List.of("op-1"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sumsAllOfACountersInputs() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "counter", Map.of(
                "inputs", List.of(literalInput("2"), literalInput("3.5"), literalInput("10"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(15.5);
    }

    @Test
    void sumsSeveralOtherOperationsResultsThroughACounter() {
        SheetData sales = new SheetData("Vendas", 2, List.of(
                new RowData(0, List.of(new CellData(0, 10L))),
                new RowData(1, List.of(new CellData(0, 5L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-counter-1", "test.xlsx", Instant.now(), List.of(sales)));

        ModelOperationInput sumA = new ModelOperationInput("op-a", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0)));
        ModelOperationInput sumB = new ModelOperationInput("op-b", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 1, "endRow", 1, "startColumn", 0, "endColumn", 0)));
        // The counter takes both sums as inputs — this is its whole point: unlike every other
        // kind (at most one chainable field), it can chain off several operations at once.
        ModelOperationInput counter = new ModelOperationInput("op-counter", "counter", Map.of(
                "inputs", List.of(referenceInput("op-a"), referenceInput("op-b"), literalInput("100"))));

        ModelOperationResult result = registerAndRun(
                datasetId, List.of(sumA, sumB, counter), null, "op-counter", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo(115L);
    }

    @Test
    void reportsACounterWithNoInputsAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "counter", Map.of("inputs", List.of()));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsANonNumericCounterEntryAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput counter = new ModelOperationInput("op-1", "counter", Map.of(
                "inputs", List.of(literalInput("not-a-number"))));

        ModelOperationResult result = registerAndRun(datasetId, List.of(counter), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsACircularReferenceThroughACountersMultipleInputsAsAnError() {
        String datasetId = twoSheetDataset();

        // op-a's counter chains back to op-b, which chains back to op-a — a cycle reachable
        // through only one of the counter's two inputs, the other being a plain literal.
        ModelOperationInput opA = new ModelOperationInput("op-a", "counter", Map.of(
                "inputs", List.of(referenceInput("op-b"), literalInput("1"))));
        ModelOperationInput opB = new ModelOperationInput("op-b", "counter", Map.of(
                "inputs", List.of(referenceInput("op-a"))));

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
        ModelOperationInput counter = new ModelOperationInput("op-counter", "counter", Map.of(
                "inputs", List.of(referenceInput("op-a"), referenceInput("op-b"))));

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
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
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
        ModelOperationInput sum = new ModelOperationInput("op-sum", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0)));

        List<ModelOperationResult> results = registerAndRunMulti(
                datasetId, List.of(broken, sum), null, List.of("op-broken", "op-sum"), null);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).success()).isFalse();
        assertThat(results.get(1).success()).isTrue();
    }

    @Test
    void rejectsRegisteringAModelWhoseOutputsIncludeAnUnknownOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> modelExecutionService.registerModel(datasetId, new ModelRegisterRequest(
                "Test model", operations, null, List.of("op-1", "does-not-exist"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRegisteringAModelWithAnEmptyOutputList() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
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
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
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

    @Test
    void aTranslatorOperationTranslatesALiteralInputThroughItsRules() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "input", literalInput("6"),
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
                "input", referenceInput("op-node"),
                "rules", translatorRules("3", "1", "6", "2")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(node, translator), null, "op-translator", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("1");
    }

    @Test
    void aTranslatorOperationWithNoMatchingRuleReportsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "input", literalInput("does-not-exist"),
                "rules", translatorRules("3", "1")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(translator), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void aTranslatorOperationWithDuplicateSourceRulesReportsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput translator = new ModelOperationInput("op-1", "translator", Map.of(
                "input", literalInput("3"),
                "rules", translatorRules("3", "1", "3", "2")));

        ModelOperationResult result = registerAndRun(datasetId, List.of(translator), null, "op-1", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void deletesARegisteredModelSoItCanNoLongerBeRun() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
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
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));
        String modelId = modelExecutionService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, List.of("op-1")));

        String otherDatasetId = storeDataset(
                new DatasetImportResponse("dataset-other", "other.xlsx", Instant.now(), List.of()));

        assertThatThrownBy(() -> modelExecutionService.deleteModel(otherDatasetId, modelId))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
