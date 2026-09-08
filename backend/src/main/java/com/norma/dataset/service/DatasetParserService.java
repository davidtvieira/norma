package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.exception.DatasetParsingException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Converts an uploaded spreadsheet file into the index-addressed dataset JSON contract.
 * Rows and columns are treated as pure sequential data; no header row is assumed. The
 * parsed dataset is kept in the {@link DatasetStore} under a generated id, which is what
 * later operations reference instead of the full dataset.
 */
@Service
public class DatasetParserService {

    private final DatasetStore datasetStore;

    public DatasetParserService(DatasetStore datasetStore) {
        this.datasetStore = datasetStore;
    }

    public DatasetImportResponse parse(MultipartFile file) {
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();

            List<SheetData> sheets = new ArrayList<>();
            for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
                sheets.add(parseSheet(workbook.getSheetAt(sheetIndex), evaluator));
            }

            DatasetImportResponse response = new DatasetImportResponse(
                    UUID.randomUUID().toString(), file.getOriginalFilename(), Instant.now(), sheets);
            datasetStore.put(response);
            return response;
        } catch (IOException | RuntimeException e) {
            throw new DatasetParsingException("Falha ao processar o ficheiro de dados: " + file.getOriginalFilename(), e);
        }
    }

    private SheetData parseSheet(Sheet sheet, FormulaEvaluator evaluator) {
        List<RowData> rows = new ArrayList<>();

        for (int rowIndex = 0; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
            Row row = sheet.getRow(rowIndex);
            rows.add(parseRow(row, rowIndex, evaluator));
        }

        return new SheetData(sheet.getSheetName(), rows.size(), rows);
    }

    private RowData parseRow(Row row, int rowIndex, FormulaEvaluator evaluator) {
        List<CellData> cells = new ArrayList<>();
        if (row != null) {
            for (int columnIndex = 0; columnIndex < row.getLastCellNum(); columnIndex++) {
                Cell cell = row.getCell(columnIndex);
                cells.add(new CellData(columnIndex, extractCellValue(cell, evaluator)));
            }
        }
        return new RowData(rowIndex, cells);
    }

    private Object extractCellValue(Cell cell, FormulaEvaluator evaluator) {
        if (cell == null) {
            return null;
        }

        if (cell.getCellType() == CellType.FORMULA) {
            evaluator.evaluateFormulaCell(cell);
        }
        CellType cellType = cell.getCellType() == CellType.FORMULA
                ? cell.getCachedFormulaResultType()
                : cell.getCellType();

        return switch (cellType) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? DateTimeFormatter.ISO_INSTANT.format(cell.getDateCellValue().toInstant())
                    : normalizeNumber(cell.getNumericCellValue());
            case BOOLEAN -> cell.getBooleanCellValue();
            case BLANK -> null;
            default -> null;
        };
    }

    private Object normalizeNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return (long) value;
        }
        return value;
    }
}
