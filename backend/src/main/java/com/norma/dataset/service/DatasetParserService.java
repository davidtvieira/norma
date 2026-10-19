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
import java.io.InputStream;
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
        try {
            return parse(file.getInputStream(), file.getOriginalFilename());
        } catch (IOException e) {
            throw new DatasetParsingException("Failed to process the data file: " + file.getOriginalFilename(), e);
        }
    }

    /** Same as {@link #parse(MultipartFile)}, for a spreadsheet that didn't arrive as an upload of
     * its own (e.g. the one bundled inside a .nrm — see {@link NrmService}). */
    public DatasetImportResponse parse(InputStream content, String filename) {
        try (Workbook workbook = WorkbookFactory.create(content)) {
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();

            List<SheetData> sheets = new ArrayList<>();
            for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
                sheets.add(parseSheet(workbook.getSheetAt(sheetIndex), evaluator));
            }

            DatasetImportResponse response = new DatasetImportResponse(
                    UUID.randomUUID().toString(), filename, Instant.now(), sheets);
            datasetStore.put(response);
            return response;
        } catch (IOException | RuntimeException e) {
            throw new DatasetParsingException("Failed to process the data file: " + filename, e);
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
                    : OperationSupport.normalizeNumber(cell.getNumericCellValue());
            case BOOLEAN -> cell.getBooleanCellValue();
            case BLANK -> null;
            default -> null;
        };
    }

    /**
     * Looks up a previously imported dataset by its id — what a reloaded page uses to get its
     * dataset back from the URL's id instead of re-uploading the file. Unknown ids (e.g. after a
     * backend restart) are a request error, same as {@link #delete}.
     */
    public DatasetImportResponse get(String datasetId) {
        return datasetStore.get(datasetId).orElseThrow(
                () -> new IllegalArgumentException("Dataset not found. Please import the file again."));
    }

    /**
     * Removes a previously imported dataset (and, transitively, anything about it a caller might
     * still hold onto — a model registered against it stays in {@link ModelStore} but can no
     * longer be run, since {@link ModelExecutionService#runModel} re-fetches the dataset by id on
     * every run). Deleting an already-deleted or unknown id is a request error, not a silent
     * no-op, so a caller finds out immediately if it raced or already cleaned up.
     */
    public void delete(String datasetId) {
        if (!datasetStore.remove(datasetId)) {
            throw new IllegalArgumentException("Dataset not found. Please import the file again.");
        }
    }
}
