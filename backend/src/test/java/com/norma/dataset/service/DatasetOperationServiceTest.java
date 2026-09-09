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
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DatasetOperationServiceTest {

    private final DatasetStore datasetStore = new DatasetStore();
    private final ModelStore modelStore = new ModelStore();
    private final DatasetOperationService datasetOperationService = new DatasetOperationService(datasetStore, modelStore);

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

    /** Registers a model and immediately runs it — the shape most of these tests only care about. */
    private ModelOperationResult registerAndRun(
            String datasetId,
            List<ModelOperationInput> operations,
            String inputOperationId,
            String outputOperationId,
            String inputValue) {
        String modelId = datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, inputOperationId, outputOperationId));
        return datasetOperationService.runModel(datasetId, modelId, inputValue);
    }

    @Test
    void returnsValueFromCorrespondingRowAcrossSheets() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 1, 1, "2");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("Caneta");
        assertThat(response.rowIndex()).isEqualTo(1);
    }

    @Test
    void looksUpWithinTheSameSheetWhenSearchAndResultSheetMatch() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 0, 1, "3");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("Carla");
    }

    @Test
    void isCaseAndWhitespaceInsensitiveWhenMatching() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 1, 0, 0, "  ana ");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("1");
    }

    @Test
    void returnsNotFoundWhenNoRowMatchesTheQuery() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 1, 1, "does-not-exist");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isFalse();
        assertThat(response.value()).isNull();
        assertThat(response.rowIndex()).isNull();
    }

    @Test
    void returnsNotFoundWhenResultSheetHasNoRowAtTheMatchedRowIndex() {
        SheetData clients = new SheetData("Clientes", 1, List.of(
                new RowData(5, List.of(new CellData(0, "1")))
        ));
        SheetData orders = new SheetData("Encomendas", 0, List.of());
        String datasetId = storeDataset(new DatasetImportResponse("dataset-2", "test.xlsx", Instant.now(), List.of(clients, orders)));

        LookupRequest request = new LookupRequest(datasetId, 0, 0, 1, 0, "1");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isFalse();
    }

    @Test
    void rejectsAnOutOfRangeSheetIndex() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 5, 1, "1");

        assertThatThrownBy(() -> datasetOperationService.lookup(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void returnsNullWithoutErrorWhenTheResultCellIsBlank() {
        SheetData clients = new SheetData("Clientes", 1, List.of(
                new RowData(0, List.of(new CellData(0, "1"), new CellData(1, null)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-3", "test.xlsx", Instant.now(), List.of(clients)));

        LookupRequest request = new LookupRequest(datasetId, 0, 0, 0, 1, "1");

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isNull();
    }

    @Test
    void rejectsAnUnknownDatasetId() {
        LookupRequest request = new LookupRequest("missing-dataset", 0, 0, 0, 1, "1");

        assertThatThrownBy(() -> datasetOperationService.lookup(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sumsNumericValuesWithinARowRange() {
        SheetData sales = new SheetData("Vendas", 4, List.of(
                new RowData(0, List.of(new CellData(0, 100L))),
                new RowData(1, List.of(new CellData(0, 200L))),
                new RowData(2, List.of(new CellData(0, 50.5))),
                new RowData(3, List.of(new CellData(0, 10L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-sum-1", "test.xlsx", Instant.now(), List.of(sales)));

        SumResponse response = datasetOperationService.sum(new SumRequest(datasetId, 0, 1, 3, 0, 0));

        assertThat(response.sum()).isEqualTo(260.5);
        assertThat(response.cellsSummed()).isEqualTo(3);
    }

    @Test
    void sumsNumericValuesAcrossMultipleColumns() {
        SheetData sales = new SheetData("Vendas", 2, List.of(
                new RowData(0, List.of(new CellData(0, 10L), new CellData(1, 20L))),
                new RowData(1, List.of(new CellData(0, 5L), new CellData(1, 15L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-sum-3", "test.xlsx", Instant.now(), List.of(sales)));

        SumResponse response = datasetOperationService.sum(new SumRequest(datasetId, 0, 0, 1, 0, 1));

        assertThat(response.sum()).isEqualTo(50.0);
        assertThat(response.cellsSummed()).isEqualTo(4);
    }

    @Test
    void skipsNonNumericAndBlankCellsWhenSumming() {
        SheetData sales = new SheetData("Vendas", 3, List.of(
                new RowData(0, List.of(new CellData(0, 10L))),
                new RowData(1, List.of(new CellData(0, "não numérico"))),
                new RowData(2, List.of(new CellData(0, null)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-sum-2", "test.xlsx", Instant.now(), List.of(sales)));

        SumResponse response = datasetOperationService.sum(new SumRequest(datasetId, 0, 0, 2, 0, 0));

        assertThat(response.sum()).isEqualTo(10.0);
        assertThat(response.cellsSummed()).isEqualTo(1);
    }

    @Test
    void rejectsANegativeStartRowForSum() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> datasetOperationService.sum(new SumRequest(datasetId, 0, -1, 0, 0, 0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsASumRangeEndingBeforeItStarts() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> datasetOperationService.sum(new SumRequest(datasetId, 0, 2, 0, 0, 0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownDatasetIdForSum() {
        assertThatThrownBy(() -> datasetOperationService.sum(new SumRequest("missing-dataset", 0, 0, 0, 0, 0)))
                .isInstanceOf(IllegalArgumentException.class);
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
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", 0,
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
        // (see DatasetParserService.normalizeNumber) — so a downstream reference to it stringifies
        // as "15", not "15.0", matching cells the same way the frontend's own testing does.
        assertThat(result.value()).isEqualTo(15L);
    }

    @Test
    void chainsALookupsResultIntoAnotherLookupsInput() {
        String datasetId = twoSheetDataset();

        // op-1 finds the row whose name (column 1) is "Bruno" and returns its id (column 0) = "2".
        ModelOperationInput findId = new ModelOperationInput("op-1", "lookup", Map.of(
                "input", literalInput("Bruno"),
                "sheetIndex", 0,
                "searchColumn", 1,
                "resultColumn", 0));

        // op-2 chains off op-1's result ("2") as the query against the orders sheet.
        ModelOperationInput findOrder = new ModelOperationInput("op-2", "lookup", Map.of(
                "input", referenceInput("op-1"),
                "sheetIndex", 1,
                "searchColumn", 0,
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
                "input", referenceInput("op-1"),
                "sheetIndex", 0,
                "searchColumn", 0,
                "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(sum, findByTotal), null, "op-2", null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
    }

    @Test
    void reportsACircularReferenceAsAnErrorInsteadOfThrowing() {
        String datasetId = twoSheetDataset();

        ModelOperationInput opA = new ModelOperationInput("op-a", "lookup", Map.of(
                "input", referenceInput("op-b"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));
        ModelOperationInput opB = new ModelOperationInput("op-b", "lookup", Map.of(
                "input", referenceInput("op-a"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));

        ModelOperationResult result = registerAndRun(datasetId, List.of(opA, opB), null, "op-a", null);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsAnUnknownReferenceAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "input", referenceInput("does-not-exist"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));

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
                "input", literalInput("this value is only used if a run doesn't override it"),
                "sheetIndex", 0,
                "searchColumn", 0,
                "resultColumn", 1));

        String modelId = datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", List.of(lookup), "op-1", "op-1"));

        ModelOperationResult result = datasetOperationService.runModel(datasetId, modelId, "3");

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Carla");
    }

    @Test
    void treatsAMissingInputValueAsAnEmptyStringWhenTheModelHasADesignatedInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", 0,
                "resultColumn", 1));

        String modelId = datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", List.of(lookup), "op-1", "op-1"));

        ModelOperationResult result = datasetOperationService.runModel(datasetId, modelId, null);

        assertThat(result.success()).isTrue();
        assertThat(result.value()).isNull();
    }

    @Test
    void rejectsRegisteringAModelWithoutAnOutputOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRegisteringAModelWhoseOutputDoesNotMatchAnyOperation() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, "does-not-exist")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownDatasetIdWhenRegisteringAModel() {
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> datasetOperationService.registerModel(
                "missing-dataset", new ModelRegisterRequest("Test model", operations, null, "op-1")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void addsUpTheCountersValuesViaTheLiveEndpoint() {
        CounterResponse response = datasetOperationService.counter(new CounterRequest(List.of("2", "3.5", "10")));

        assertThat(response.total()).isEqualTo(15.5);
    }

    @Test
    void rejectsALiveCounterCallWithNoValues() {
        assertThatThrownBy(() -> datasetOperationService.counter(new CounterRequest(List.of())))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsALiveCounterCallWithANonNumericValue() {
        assertThatThrownBy(() -> datasetOperationService.counter(new CounterRequest(List.of("1", "not-a-number"))))
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
    void rejectsAnUnknownModelIdWhenRunning() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> datasetOperationService.runModel(datasetId, "missing-model", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRunningAModelAgainstADifferentDatasetThanItWasRegisteredFor() {
        String datasetId = twoSheetDataset();
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));
        String modelId = datasetOperationService.registerModel(
                datasetId, new ModelRegisterRequest("Test model", operations, null, "op-1"));

        String otherDatasetId = storeDataset(
                new DatasetImportResponse("dataset-other", "other.xlsx", Instant.now(), List.of()));

        assertThatThrownBy(() -> datasetOperationService.runModel(otherDatasetId, modelId, null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
