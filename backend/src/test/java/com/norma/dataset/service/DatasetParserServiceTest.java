package com.norma.dataset.service;

import com.norma.dataset.dto.DatasetImportResponse;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

class DatasetParserServiceTest {

    private final DatasetParserService datasetParserService = new DatasetParserService(new DatasetStore());

    @Test
    void parsesRowsAndCellsByIndexWithoutAssumingHeader() throws IOException {
        MockMultipartFile file = new MockMultipartFile(
                "file", "data_import.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                buildWorkbookBytes());

        DatasetImportResponse response = datasetParserService.parse(file);

        assertThat(response.datasetId()).isNotBlank();
        assertThat(response.filename()).isEqualTo("data_import.xlsx");
        assertThat(response.sheets()).hasSize(1);

        var sheet = response.sheets().get(0);
        assertThat(sheet.sheetName()).isEqualTo("Sheet1");
        assertThat(sheet.totalRows()).isEqualTo(2);

        var headerRow = sheet.rows().get(0);
        assertThat(headerRow.rowIndex()).isEqualTo(0);
        assertThat(headerRow.cells().get(0).value()).isEqualTo("ID");
        assertThat(headerRow.cells().get(1).value()).isEqualTo("Name");

        var dataRow = sheet.rows().get(1);
        assertThat(dataRow.cells().get(0).value()).isEqualTo(101L);
        assertThat(dataRow.cells().get(1).value()).isEqualTo("Alice Johnson");
    }

    @Test
    void parsesLegacyXlsFilesTheSameWayAsXlsx() throws IOException {
        MockMultipartFile file = new MockMultipartFile(
                "file", "data_import.xls", "application/vnd.ms-excel",
                buildWorkbookBytes(new HSSFWorkbook()));

        DatasetImportResponse response = datasetParserService.parse(file);

        assertThat(response.filename()).isEqualTo("data_import.xls");
        var sheet = response.sheets().get(0);
        assertThat(sheet.rows().get(0).cells().get(0).value()).isEqualTo("ID");
        assertThat(sheet.rows().get(1).cells().get(0).value()).isEqualTo(101L);
    }

    private byte[] buildWorkbookBytes() throws IOException {
        return buildWorkbookBytes(new XSSFWorkbook());
    }

    private byte[] buildWorkbookBytes(Workbook workbook) throws IOException {
        try (workbook) {
            Sheet sheet = workbook.createSheet("Sheet1");

            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("ID");
            header.createCell(1).setCellValue("Name");

            Row data = sheet.createRow(1);
            data.createCell(0).setCellValue(101);
            data.createCell(1).setCellValue("Alice Johnson");

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            return outputStream.toByteArray();
        }
    }
}
