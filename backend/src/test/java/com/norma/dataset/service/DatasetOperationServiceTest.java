package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

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
}
