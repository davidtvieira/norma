package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Runs data operations against a dataset previously imported and kept in memory by
 * {@link DatasetStore} — callers reference it by id instead of resending the full JSON.
 */
@Service
public class DatasetOperationService {

    private final DatasetStore datasetStore;

    public DatasetOperationService(DatasetStore datasetStore) {
        this.datasetStore = datasetStore;
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

        if (request.startRow() < 0) {
            throw new IllegalArgumentException("A linha inicial não pode ser negativa.");
        }

        double total = 0;
        int rowsSummed = 0;
        for (RowData row : sheet.rows()) {
            if (row.rowIndex() < request.startRow()) {
                continue;
            }
            Object value = cellValue(row, request.column());
            if (value instanceof Number number) {
                total += number.doubleValue();
                rowsSummed++;
            }
        }

        return new SumResponse(total, rowsSummed);
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
