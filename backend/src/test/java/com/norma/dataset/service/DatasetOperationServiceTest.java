package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import com.norma.dataset.dto.TranslatorRequest;
import com.norma.dataset.dto.TranslatorResponse;
import com.norma.dataset.dto.TranslatorRule;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers the single-operation live-editor endpoints (lookup/sum/find/counter/node/translator),
 * each called directly against a dataset with no model registration involved — see
 * {@link ModelExecutionServiceTest} for the model registration/run/graph-resolution behavior
 * that used to live in this same file, back when both were implemented by one service class.
 */
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
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 1, 1, "2", 0, null, false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("Caneta");
        assertThat(response.rowIndex()).isEqualTo(1);
    }

    @Test
    void looksUpWithinTheSameSheetWhenSearchAndResultSheetMatch() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 0, 1, "3", 0, null, false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("Carla");
    }

    @Test
    void isCaseAndWhitespaceInsensitiveWhenMatching() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 1, 0, 0, "  ana ", 0, null, false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("1");
    }

    @Test
    void returnsNotFoundWhenNoRowMatchesTheQuery() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 1, 1, "does-not-exist", 0, null, false, false);

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

        LookupRequest request = new LookupRequest(datasetId, 0, 0, 1, 0, "1", 0, null, false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isFalse();
    }

    @Test
    void rejectsAnOutOfRangeSheetIndex() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 0, 5, 1, "1", 0, null, false, false);

        assertThatThrownBy(() -> datasetOperationService.lookup(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void returnsNullWithoutErrorWhenTheResultCellIsBlank() {
        SheetData clients = new SheetData("Clientes", 1, List.of(
                new RowData(0, List.of(new CellData(0, "1"), new CellData(1, null)))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-3", "test.xlsx", Instant.now(), List.of(clients)));

        LookupRequest request = new LookupRequest(datasetId, 0, 0, 0, 1, "1", 0, null, false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isNull();
    }

    @Test
    void rejectsAnUnknownDatasetId() {
        LookupRequest request = new LookupRequest("missing-dataset", 0, 0, 0, 1, "1", 0, null, false, false);

        assertThatThrownBy(() -> datasetOperationService.lookup(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void containsModeMatchesASubstringOfTheCell() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 1, 0, 0, "an", 0, "contains", false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("1");
    }

    @Test
    void equalsModeDoesNotMatchAPartialSubstring() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 1, 0, 0, "an", 0, "equals", false, false);

        LookupResponse response = datasetOperationService.lookup(request);

        assertThat(response.found()).isFalse();
    }

    @Test
    void rejectsAnUnknownMatchMode() {
        LookupRequest request = new LookupRequest(twoSheetDataset(), 0, 1, 0, 0, "an", 0, "startsWith", false, false);

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

    @Test
    void findsTheFirstMatchingCellWithinARange() {
        String datasetId = twoSheetDataset();

        FindResponse response = datasetOperationService.find(new FindRequest(datasetId, 0, 0, 2, 0, 1, "Bruno"));

        assertThat(response.found()).isTrue();
        assertThat(response.rowIndex()).isEqualTo(1);
        assertThat(response.columnIndex()).isEqualTo(1);
    }

    @Test
    void findsWithinTheSameRowBeforeMovingToTheNextOne() {
        SheetData sheet = new SheetData("Grid", 2, List.of(
                new RowData(0, List.of(new CellData(0, "x"), new CellData(1, "alvo"))),
                new RowData(1, List.of(new CellData(0, "alvo"), new CellData(1, "x")))
        ));
        String datasetId = storeDataset(new DatasetImportResponse("dataset-find-1", "test.xlsx", Instant.now(), List.of(sheet)));

        FindResponse response = datasetOperationService.find(new FindRequest(datasetId, 0, 0, 1, 0, 1, "alvo"));

        assertThat(response.found()).isTrue();
        assertThat(response.rowIndex()).isEqualTo(0);
        assertThat(response.columnIndex()).isEqualTo(1);
    }

    @Test
    void isCaseAndWhitespaceInsensitiveWhenFinding() {
        String datasetId = twoSheetDataset();

        FindResponse response = datasetOperationService.find(new FindRequest(datasetId, 0, 0, 2, 0, 1, "  bruno "));

        assertThat(response.found()).isTrue();
        assertThat(response.rowIndex()).isEqualTo(1);
    }

    @Test
    void returnsNotFoundWhenNothingInTheRangeMatches() {
        String datasetId = twoSheetDataset();

        FindResponse response = datasetOperationService.find(new FindRequest(datasetId, 0, 0, 2, 0, 1, "does-not-exist"));

        assertThat(response.found()).isFalse();
        assertThat(response.rowIndex()).isNull();
        assertThat(response.columnIndex()).isNull();
    }

    @Test
    void aMatchOutsideTheRangeIsNotFound() {
        String datasetId = twoSheetDataset();

        // "Carla" is row 2, but the range only covers rows 0-1.
        FindResponse response = datasetOperationService.find(new FindRequest(datasetId, 0, 0, 1, 0, 1, "Carla"));

        assertThat(response.found()).isFalse();
    }

    @Test
    void rejectsANegativeStartRowForFind() {
        String datasetId = twoSheetDataset();

        assertThatThrownBy(() -> datasetOperationService.find(new FindRequest(datasetId, 0, -1, 0, 0, 0, "x")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownDatasetIdForFind() {
        assertThatThrownBy(() -> datasetOperationService.find(new FindRequest("missing-dataset", 0, 0, 0, 0, 0, "x")))
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
    void passesAValueThroughViaTheLiveNodeEndpoint() {
        NodeResponse response = datasetOperationService.node(new NodeRequest("Bruno"));

        assertThat(response.value()).isEqualTo("Bruno");
    }

    @Test
    void treatsANullValueAsAnEmptyStringForTheLiveNodeEndpoint() {
        NodeResponse response = datasetOperationService.node(new NodeRequest(null));

        assertThat(response.value()).isEqualTo("");
    }

    /** "X" appears twice (rows 0 and 2) — the fixture the startRow test below skips past the
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
    void theLiveLookupEndpointHonoursStartRowToo() {
        String datasetId = duplicateValueDataset();

        LookupResponse response = datasetOperationService.lookup(new LookupRequest(datasetId, 0, 0, 0, 1, "X", 1, null, false, false));

        assertThat(response.found()).isTrue();
        assertThat(response.value()).isEqualTo("B");
        assertThat(response.rowIndex()).isEqualTo(2);
    }

    @Test
    void translatesAValueViaTheLiveEndpoint() {
        TranslatorResponse response = datasetOperationService.translator(new TranslatorRequest("3", List.of(
                new TranslatorRule("3", "1"),
                new TranslatorRule("4", "1"),
                new TranslatorRule("5", "1"),
                new TranslatorRule("6", "2"))));

        assertThat(response.value()).isEqualTo("1");
    }

    @Test
    void rejectsALiveTranslatorCallWithNoMatchingRule() {
        assertThatThrownBy(() -> datasetOperationService.translator(new TranslatorRequest("does-not-exist", List.of(
                new TranslatorRule("3", "1")))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsALiveTranslatorCallWithDuplicateSourceRules() {
        assertThatThrownBy(() -> datasetOperationService.translator(new TranslatorRequest("3", List.of(
                new TranslatorRule("3", "1"),
                new TranslatorRule("3", "2")))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsALiveTranslatorCallWithNoRules() {
        assertThatThrownBy(() -> datasetOperationService.translator(new TranslatorRequest("3", List.of())))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
