package com.norma.dataset.service;

import com.norma.dataset.dto.NrmImportResponse;
import com.norma.dataset.dto.NrmInfo;
import com.norma.dataset.exception.DatasetParsingException;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NrmServiceTest {

    private static final String MODEL = """
            {"version":1,"modelName":"M","datasetId":"d","inputOperationIds":[],"outputOperationIds":["a"],
             "operations":[{"id":"a","kind":"sum","name":"Soma","fields":{},"position":{"x":0,"y":0},
               "operations":[{"id":"b","kind":"lookup","name":"L","fields":{},"operations":[]}]}]}""";
    private static final String INFO = "{\"version\":1,\"name\":\"Vendas\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}";

    private final NrmService nrmService = new NrmService(new DatasetParserService(new DatasetStore()));

    @Test
    void importsAValidNrmAndReturnsItsDatasetAndInfo() throws IOException {
        NrmImportResponse response = nrmService.importNrm(nrm("a.nrm", entries(MODEL, INFO)));

        assertThat(response.dataset().filename()).isEqualTo("dados.xlsx");
        assertThat(response.dataset().sheets()).hasSize(1);
        NrmInfo info = response.info();
        assertThat(info.name()).isEqualTo("Vendas");
        assertThat(info.createdAt().toString()).isEqualTo("2026-10-19T13:04:00Z");
    }

    @Test
    void validateAcceptsAValidNrmWithoutStoringAnything() throws IOException {
        assertThat(nrmService.validate(nrm("a.nrm", entries(MODEL, INFO))).name()).isEqualTo("Vendas");
    }

    @Test
    void rejectsAFileWithoutTheNrmExtension() throws IOException {
        assertThatThrownBy(() -> nrmService.validate(nrm("a.zip", entries(MODEL, INFO))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsContentThatIsNotAZip() {
        assertThatThrownBy(() -> nrmService.validate(new MockMultipartFile("file", "a.nrm", null, "hello".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(DatasetParsingException.class);
    }

    @Test
    void rejectsAMissingInfoJson() throws IOException {
        Map<String, byte[]> entries = entries(MODEL, INFO);
        entries.remove("info.json");
        assertRejected(entries);
    }

    @Test
    void rejectsAMissingModelOrDataset() throws IOException {
        Map<String, byte[]> noModel = entries(MODEL, INFO);
        noModel.remove("modelo.json");
        assertRejected(noModel);

        Map<String, byte[]> noDataset = entries(MODEL, INFO);
        noDataset.remove("dados.xlsx");
        assertRejected(noDataset);
    }

    @Test
    void rejectsDuplicateAndUnexpectedEntries() throws IOException {
        Map<String, byte[]> twoModels = entries(MODEL, INFO);
        twoModels.put("outro.json", MODEL.getBytes(StandardCharsets.UTF_8));
        assertRejected(twoModels);

        Map<String, byte[]> extra = entries(MODEL, INFO);
        extra.put("notas.txt", new byte[] {1});
        assertRejected(extra);
    }

    @Test
    void rejectsMalformedModelsAndUnknownOperationKinds() throws IOException {
        assertRejected(entries("not json", INFO));
        assertRejected(entries("{\"modelName\":\"M\"}", INFO));
        assertRejected(entries(MODEL.replace("\"sum\"", "\"bogus\""), INFO));
        assertRejected(entries(MODEL.replace("\"fields\":{},\"position\"", "\"position\""), INFO));
    }

    @Test
    void rejectsABadInfoJson() throws IOException {
        assertRejected(entries(MODEL, INFO.replace("\"version\":1", "\"version\":2")));
        assertRejected(entries(MODEL, INFO.replace("Vendas", "  ")));
        assertRejected(entries(MODEL, INFO.replace("2026-10-19T13:04:00.000Z", "ontem")));
    }

    @Test
    void rejectsASpreadsheetThatCannotBeOpened() throws IOException {
        Map<String, byte[]> entries = entries(MODEL, INFO);
        entries.put("dados.xlsx", new byte[] {1, 2, 3});
        assertThatThrownBy(() -> nrmService.validate(nrm("a.nrm", entries))).isInstanceOf(DatasetParsingException.class);
    }

    private void assertRejected(Map<String, byte[]> entries) throws IOException {
        assertThatThrownBy(() -> nrmService.validate(nrm("a.nrm", entries)))
                .isInstanceOf(DatasetParsingException.class)
                .hasMessage("Invalid .nrm file.");
    }

    private static Map<String, byte[]> entries(String model, String info) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("dados.xlsx", workbookBytes());
        entries.put("modelo.json", model.getBytes(StandardCharsets.UTF_8));
        entries.put("info.json", info.getBytes(StandardCharsets.UTF_8));
        return entries;
    }

    private static MockMultipartFile nrm(String filename, Map<String, byte[]> entries) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return new MockMultipartFile("file", filename, "application/octet-stream", out.toByteArray());
    }

    private static byte[] workbookBytes() throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            workbook.createSheet("Sheet1").createRow(0).createCell(0).setCellValue("ID");
            workbook.write(out);
            return out.toByteArray();
        }
    }
}
