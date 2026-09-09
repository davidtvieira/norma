package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.ModelCalculateResponse;
import com.norma.dataset.dto.ModelOperationInput;
import com.norma.dataset.dto.ModelOperationResult;
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
    private final DatasetOperationService datasetOperationService = new DatasetOperationService(datasetStore);

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
    void calculatesALookupOperationWithALiteralInput() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "input", literalInput("2"),
                "sheetIndex", 0,
                "searchColumn", 0,
                "resultColumn", 1));

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(lookup));

        assertThat(response.results()).hasSize(1);
        ModelOperationResult result = response.results().get(0);
        assertThat(result.success()).isTrue();
        assertThat(result.value()).isEqualTo("Bruno");
        assertThat(result.error()).isNull();
    }

    @Test
    void calculatesASumOperation() {
        SheetData sales = new SheetData("Vendas", 2, List.of(
                new RowData(0, List.of(new CellData(0, 10L))),
                new RowData(1, List.of(new CellData(0, 5L)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-model-sum", "test.xlsx", Instant.now(), List.of(sales)));

        ModelOperationInput sum = new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0,
                "range", Map.of("startRow", 0, "endRow", 1, "startColumn", 0, "endColumn", 0)));

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(sum));

        ModelOperationResult result = response.results().get(0);
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

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(findId, findOrder));

        Map<String, ModelOperationResult> byId = response.results().stream()
                .collect(java.util.stream.Collectors.toMap(ModelOperationResult::id, r -> r));

        assertThat(byId.get("op-1").value()).isEqualTo("2");
        assertThat(byId.get("op-2").success()).isTrue();
        assertThat(byId.get("op-2").value()).isEqualTo("Caneta");
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

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(sum, findByTotal));

        Map<String, ModelOperationResult> byId = response.results().stream()
                .collect(java.util.stream.Collectors.toMap(ModelOperationResult::id, r -> r));

        assertThat(byId.get("op-2").success()).isTrue();
        assertThat(byId.get("op-2").value()).isEqualTo("Bruno");
    }

    @Test
    void reportsACircularReferenceAsAnErrorWithoutFailingTheWholeRequest() {
        String datasetId = twoSheetDataset();

        ModelOperationInput opA = new ModelOperationInput("op-a", "lookup", Map.of(
                "input", referenceInput("op-b"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));
        ModelOperationInput opB = new ModelOperationInput("op-b", "lookup", Map.of(
                "input", referenceInput("op-a"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(opA, opB));

        assertThat(response.results()).allSatisfy(result -> {
            assertThat(result.success()).isFalse();
            assertThat(result.error()).isNotBlank();
        });
    }

    @Test
    void reportsAnUnknownReferenceAsAnError() {
        String datasetId = twoSheetDataset();

        ModelOperationInput lookup = new ModelOperationInput("op-1", "lookup", Map.of(
                "input", referenceInput("does-not-exist"), "sheetIndex", 0, "searchColumn", 0, "resultColumn", 1));

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(lookup));

        ModelOperationResult result = response.results().get(0);
        assertThat(result.success()).isFalse();
        assertThat(result.error()).isNotBlank();
    }

    @Test
    void reportsAnUnknownOperationKindAsAnErrorWithoutFailingTheWholeRequest() {
        String datasetId = twoSheetDataset();

        ModelOperationInput unknown = new ModelOperationInput("op-1", "does-not-exist", Map.of());
        ModelOperationInput sum = new ModelOperationInput("op-2", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0)));

        ModelCalculateResponse response = datasetOperationService.calculateModel(datasetId, List.of(unknown, sum));

        Map<String, ModelOperationResult> byId = response.results().stream()
                .collect(java.util.stream.Collectors.toMap(ModelOperationResult::id, r -> r));
        assertThat(byId.get("op-1").success()).isFalse();
        assertThat(byId.get("op-2").success()).isTrue();
    }

    @Test
    void rejectsAnUnknownDatasetIdForModelCalculation() {
        List<ModelOperationInput> operations = List.of(new ModelOperationInput("op-1", "sum", Map.of(
                "sheetIndex", 0, "range", Map.of("startRow", 0, "endRow", 0, "startColumn", 0, "endColumn", 0))));

        assertThatThrownBy(() -> datasetOperationService.calculateModel("missing-dataset", operations))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
