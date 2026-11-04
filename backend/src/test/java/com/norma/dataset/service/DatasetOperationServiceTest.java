package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.CalcRequest;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SelectorRequest;
import com.norma.dataset.dto.SheetData;
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

    @Test
    void theLiveTranslatorEndpointTranslatesWithRanges() {
        List<TranslatorRule> rules = List.of(new TranslatorRule(null, "baixo", null, "4"), new TranslatorRule(null, "alto", "5", null));

        assertThat(datasetOperationService.translator(new TranslatorRequest("3", "range", rules)).value()).isEqualTo("baixo");
        assertThat(datasetOperationService.translator(new TranslatorRequest("5", "range", rules)).value()).isEqualTo("alto");
        assertThatThrownBy(() -> datasetOperationService.translator(new TranslatorRequest("4,5", "range", rules)))
                .isInstanceOf(IllegalArgumentException.class);
    }

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
    void selectsTheValueAtTheIndexViaTheLiveEndpoint() {
        assertThat(datasetOperationService.selector(new SelectorRequest("1", List.of("a", "b", "c"))).value()).isEqualTo("b");
    }

    @Test
    void rejectsALiveSelectorCallWithAnIndexOutsideTheValues() {
        assertThatThrownBy(() -> datasetOperationService.selector(new SelectorRequest("3", List.of("a", "b", "c"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> datasetOperationService.selector(new SelectorRequest("0", List.of())))
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

    @Test
    void calcTakesAnyNumberOfValuesInItsLiveEndpointToo() {
        assertThat(datasetOperationService.calc(new CalcRequest(List.of("2", "3.5", "10"), "add", "none")).value()).isEqualTo(15.5);
        assertThat(datasetOperationService.calc(new CalcRequest(List.of("2", "5", "1"), "subtract", "abs")).value()).isEqualTo(4L);
        assertThatThrownBy(() -> datasetOperationService.calc(new CalcRequest(List.of("5"), "subtract", "none")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(datasetOperationService.calc(new CalcRequest(List.of("2", "5"), "subtract", "none")).value()).isEqualTo(-3L);
    }

    @Test
    void filterKeepsOnlyTheValuesThatMeetTheConditionAndRejectsAnIncompleteOne() {
        assertThat(datasetOperationService.filter(new com.norma.dataset.dto.FilterRequest(
                "range", null, null, "1", "", List.of("0", "1", "50", "x", " "))).values()).containsExactly("1", "50");
        assertThat(datasetOperationService.filter(new com.norma.dataset.dto.FilterRequest(
                "single", "contains", "AB", null, null, List.of("xaby", "zzz"))).values()).containsExactly("xaby");
        assertThat(datasetOperationService.filter(new com.norma.dataset.dto.FilterRequest(
                "single", "eq", "7", null, null, List.of("7.0", "8"))).values()).containsExactly("7.0");
        assertThatThrownBy(() -> datasetOperationService.filter(new com.norma.dataset.dto.FilterRequest(
                "range", null, null, "", " ", List.of("1"))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
