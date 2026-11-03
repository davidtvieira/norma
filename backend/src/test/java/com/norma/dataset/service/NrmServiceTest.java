package com.norma.dataset.service;

import com.norma.dataset.dto.NrmImportStatus;
import com.norma.dataset.dto.NrmInfo;
import com.norma.dataset.exception.DatasetParsingException;
import com.norma.dataset.exception.ModelDatasetMismatchException;
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
             "operations":[{"id":"a","kind":"find","name":"Soma","fields":{},"position":{"x":0,"y":0},
               "operations":[{"id":"b","kind":"lookup","name":"L","fields":{},"operations":[]}]}]}""";
    // A "node" operation just returns its (literal) input, so no dataset content is needed to run it.
    private static final String MODEL_WITH_INPUT = """
            {"version":1,"modelName":"M","datasetId":"d","inputOperationIds":["b"],"outputOperationIds":["b"],
             "operations":[{"id":"b","kind":"node","name":"Valor",
               "fields":{"input":{"type":"literal","value":""}},"operations":[]}]}""";
    private static final String INFO = "{\"version\":1,\"name\":\"Vendas\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}";

    private final DatasetStore datasetStore = new DatasetStore();
    private final NrmService nrmService = new NrmService(
            new DatasetParserService(datasetStore),
            new ModelExecutionService(datasetStore, new ModelStore()),
            new NrmStore());

    @Test
    void importsAValidNrmAndReturnsOnlyItsStatusAndId() throws IOException {
        NrmImportStatus response = nrmService.importNrm(nrm("a.nrm", entries(MODEL, INFO)));

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.nrmId()).isNotBlank();
    }

    @Test
    void anImportedNrmServesItsInputsRunsAndDatasetByItsOwnId() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL_WITH_INPUT, INFO)));

        assertThat(nrmService.getInputs(imported.nrmId()).inputs()).singleElement().satisfies(input -> {
            assertThat(input.id()).isEqualTo("b");
            assertThat(input.name()).isEqualTo("Valor");
        });
        assertThat(nrmService.run(imported.nrmId(), Map.of("b", "x"))).singleElement().satisfies(result -> {
            assertThat(result.id()).isEqualTo("b");
            assertThat(result.name()).isEqualTo("Valor");
            assertThat(result.success()).isTrue();
            assertThat(result.value()).isEqualTo("x");
        });
        assertThat(nrmService.getDataset(imported.nrmId()).sheets()).hasSize(1);
    }

    /** One input, and its validation rule set kept in the model's settings (an integer from 0 to 9) instead of on the canvas. */
    private static final String MODEL_WITH_VALIDATION_SETTINGS = """
            {"modelName":"M","datasetId":"d","inputOperationIds":["b"],"outputOperationIds":["b"],
             "operations":[{"id":"b","kind":"node","name":"Valor",
               "fields":{"input":{"type":"literal","value":""}},"operations":[]}],
             "settings":{"validation":[{"id":"v","name":"Pergunta","fields":
               {"type":"integer","required":true,"min":0,"max":9,"appliesTo":["b"]}}]}}""";

    @Test
    void aModelsValidationSettingsApplyToItsInputsAsAFormatterWould() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL_WITH_VALIDATION_SETTINGS, INFO)));

        assertThat(nrmService.getInputs(imported.nrmId()).inputs()).singleElement().satisfies(input ->
                assertThat(input.format().max()).isEqualByComparingTo("9"));
        assertThat(nrmService.run(imported.nrmId(), Map.of("b", "5"))).singleElement().satisfies(result -> {
            assertThat(result.success()).isTrue();
            assertThat(result.value()).isEqualTo("5");
        });
        assertThat(nrmService.run(imported.nrmId(), Map.of("b", "12"))).singleElement().satisfies(result ->
                assertThat(result.success()).isFalse());
        assertThat(nrmService.run(imported.nrmId(), Map.of())).singleElement().satisfies(result ->
                assertThat(result.success()).isFalse());
    }

    /** A page selector kept in the model's settings: its input is a node on the canvas, the value says which page to read. */
    private static final String MODEL_WITH_PAGE_SETTING = """
            {"modelName":"M","datasetId":"d","inputOperationIds":["n"],"outputOperationIds":["f"],
             "operations":[
               {"id":"n","kind":"node","name":"Página","fields":{"input":{"type":"literal","value":"0"}},"operations":[]},
               {"id":"f","kind":"find","name":"Procurar","fields":{"input":{"type":"literal","value":"x"},"sheetIndex":0,
                 "range":{"startRow":0,"endRow":0,"startColumn":0,"endColumn":0}},"operations":[]}],
             "settings":{"page":{"id":"p","name":"Selecionar Página","fields":{"input":{"type":"reference","operationId":"n"}}}}}""";

    @Test
    void aModelsPageSettingMakesItsOperationsReadThePageItPicks() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL_WITH_PAGE_SETTING, INFO)));

        // The dataset has one page: page 0 is fine, page 1 does not exist, and either way the page selector is what decides.
        assertThat(nrmService.run(imported.nrmId(), Map.of("n", "0"))).singleElement().satisfies(result ->
                assertThat(result.success()).isTrue());
        assertThat(nrmService.run(imported.nrmId(), Map.of("n", "5"))).singleElement().satisfies(result ->
                assertThat(result.success()).isFalse());
    }

    /** An iteration kept in the model's settings over the dataset's only page; a node on the canvas reads its position. */
    private static final String MODEL_WITH_ITERATION_SETTING = """
            {"modelName":"M","datasetId":"d","inputOperationIds":[],"outputOperationIds":["n"],
             "operations":[
               {"id":"n","kind":"node","name":"Posição","fields":{"input":{"type":"reference","operationId":"it"}},"operations":[]}],
             "settings":{"iteration":{"id":"it","name":"Iterador","fields":{"startSheet":0,"endSheet":0,"previewSheet":"","descriptions":["Só uma"]}}}}""";

    @Test
    void aModelsIterationSettingRunsItOncePerPageAndCanBeReferenced() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL_WITH_ITERATION_SETTING, INFO)));

        assertThat(nrmService.run(imported.nrmId(), Map.of())).singleElement().satisfies(result -> {
            assertThat(result.success()).isTrue();
            assertThat(result.value()).isEqualTo("0");
            assertThat(result.name()).isEqualTo("Só uma");
        });
    }

    @Test
    void aModelWithAnIterationSettingNeedsADatasetAndPagesThatExist() throws IOException {
        Map<String, byte[]> withoutDataset = new LinkedHashMap<>();
        withoutDataset.put("modelo.json", MODEL_WITH_ITERATION_SETTING.getBytes(StandardCharsets.UTF_8));
        withoutDataset.put("info.json", "{\"version\":2,\"name\":\"Vendas\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", withoutDataset))).isInstanceOf(ModelDatasetMismatchException.class);

        String tooFar = MODEL_WITH_ITERATION_SETTING.replace("\"endSheet\":0", "\"endSheet\":5");
        assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", entries(tooFar, INFO)))).isInstanceOf(ModelDatasetMismatchException.class);
    }

    @Test
    void aModelWithAPageSettingNeedsADataset() throws IOException {
        Map<String, byte[]> withoutDataset = new LinkedHashMap<>();
        withoutDataset.put("modelo.json", MODEL_WITH_PAGE_SETTING.getBytes(StandardCharsets.UTF_8));
        withoutDataset.put("info.json", "{\"version\":2,\"name\":\"Vendas\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", withoutDataset))).isInstanceOf(ModelDatasetMismatchException.class);
    }

    @Test
    void rejectsAModelWhoseSettingsAreMalformed() {
        assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", entries(
                MODEL_WITH_VALIDATION_SETTINGS.replace("\"name\":\"Pergunta\",", ""), INFO))))
                .isInstanceOf(DatasetParsingException.class);
        assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", entries(
                MODEL_WITH_VALIDATION_SETTINGS.replace("\"validation\":[", "\"validation\":{\"x\":["), INFO))))
                .isInstanceOf(DatasetParsingException.class);
    }

    @Test
    void anImportedNrmServesItsOriginalModelWithTheNrmName() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL, INFO)));

        var model = nrmService.getModel(imported.nrmId());

        assertThat(model.path("modelName").asText()).isEqualTo("M");
        assertThat(model.path("nrmName").asText()).isEqualTo("Vendas");
        assertThat(model.path("operations").get(0).path("position").path("x").asInt()).isZero();
        assertThat(model.path("operations").get(0).path("operations")).hasSize(1);
        assertThatThrownBy(() -> nrmService.getModel("missing")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anImportedNrmWithoutAnOutputHasNoModelToUse() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL.replace("[\"a\"]", "[]"), INFO)));

        assertThat(nrmService.getDataset(imported.nrmId())).isNotNull();
        assertThatThrownBy(() -> nrmService.getInputs(imported.nrmId())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnknownNrmId() {
        assertThatThrownBy(() -> nrmService.getInputs("missing")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> nrmService.run("missing", Map.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> nrmService.getDataset("missing")).isInstanceOf(IllegalArgumentException.class);
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
        assertRejected(entries(MODEL.replace("\"find\"", "\"bogus\""), INFO));
        assertRejected(entries(MODEL.replace("\"fields\":{},\"position\"", "\"position\""), INFO));
    }

    @Test
    void rejectsABadInfoJson() throws IOException {
        assertRejected(entries(MODEL, INFO.replace("\"version\":1", "\"version\":3")));
        assertRejected(entries(MODEL, INFO.replace("Vendas", "  ")));
        assertRejected(entries(MODEL, INFO.replace("2026-10-19T13:04:00.000Z", "ontem")));
    }

    @Test
    void rejectsASpreadsheetThatCannotBeOpened() throws IOException {
        Map<String, byte[]> entries = entries(MODEL, INFO);
        entries.put("dados.xlsx", new byte[] {1, 2, 3});
        assertThatThrownBy(() -> nrmService.validate(nrm("a.nrm", entries))).isInstanceOf(DatasetParsingException.class);
    }

    @Test
    void rejectsAModelPointingAtASheetTheDatasetDoesNotHave() throws IOException {
        // The bundled workbook has a single sheet (index 0).
        String sumOnSheet1 = MODEL.replace("\"name\":\"Soma\",\"fields\":{}", "\"name\":\"Soma\",\"fields\":{\"sheetIndex\":1}");
        String nestedLookupOnSheet2 = MODEL.replace("\"name\":\"L\",\"fields\":{}", "\"name\":\"L\",\"fields\":{\"searchSheetIndex\":2}");
        String iteratorPastTheEnd = MODEL.replace("\"name\":\"Soma\",\"fields\":{}", "\"name\":\"Soma\",\"fields\":{\"startSheet\":0,\"endSheet\":3}");

        for (String model : new String[] {sumOnSheet1, nestedLookupOnSheet2, iteratorPastTheEnd}) {
            assertThatThrownBy(() -> nrmService.validate(nrm("a.nrm", entries(model, INFO))))
                    .isInstanceOf(ModelDatasetMismatchException.class);
            assertThatThrownBy(() -> nrmService.importNrm(nrm("a.nrm", entries(model, INFO))))
                    .isInstanceOf(ModelDatasetMismatchException.class);
        }
    }

    @Test
    void acceptsAModelWhoseSheetsAllExist() throws IOException {
        String onSheet0 = MODEL.replace("\"name\":\"Soma\",\"fields\":{}", "\"name\":\"Soma\",\"fields\":{\"sheetIndex\":0}");

        assertThat(nrmService.validate(nrm("a.nrm", entries(onSheet0, INFO))).name()).isEqualTo("Vendas");
    }

    @Test
    void checksAModelAgainstAnAlreadyImportedDataset() throws IOException {
        var dataset = new DatasetParserService(datasetStore)
                .parse(new java.io.ByteArrayInputStream(workbookBytes()), "dados.xlsx");
        var executionService = new ModelExecutionService(datasetStore, new ModelStore());
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();

        executionService.assertModelFitsDataset(dataset.datasetId(), mapper.readTree(MODEL));
        assertThatThrownBy(() -> executionService.assertModelFitsDataset(dataset.datasetId(),
                mapper.readTree(MODEL.replace("\"fields\":{},\"position\"", "\"fields\":{\"sheetIndex\":5},\"position\""))))
                .isInstanceOf(ModelDatasetMismatchException.class);
    }

    // --- the description a norma may carry ---

    private static String withDescription(String text) {
        return INFO.substring(0, INFO.length() - 1) + ",\"description\":\"" + text + "\"}";
    }

    @Test
    void aNrmCarriesAnOptionalDescriptionThatIsInspectedAndServedWithTheModel() throws IOException {
        byte[] described = nrm("a.nrm", entries(MODEL_WITH_INPUT, withDescription("  Questionário ASEBA  "))).getBytes();
        byte[] plain = nrm("b.nrm", entries(MODEL_WITH_INPUT, INFO)).getBytes();

        assertThat(nrmService.inspect(described).description()).isEqualTo("Questionário ASEBA");
        assertThat(nrmService.inspect(plain).description()).isNull();

        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entries(MODEL_WITH_INPUT, withDescription("Questionário ASEBA"))));
        assertThat(nrmService.getModel(imported.nrmId()).path("nrmDescription").asText()).isEqualTo("Questionário ASEBA");
        NrmImportStatus without = nrmService.importNrm(nrm("b.nrm", entries(MODEL_WITH_INPUT, INFO)));
        assertThat(nrmService.getModel(without.nrmId()).has("nrmDescription")).isFalse();
    }

    @Test
    void aDescriptionThatIsTooLongIsRejected() throws IOException {
        assertRejected(entries(MODEL, withDescription("x".repeat(NrmService.MAX_DESCRIPTION_LENGTH + 1))));
        assertThat(nrmService.inspect(nrm("a.nrm", entries(MODEL, withDescription("x".repeat(NrmService.MAX_DESCRIPTION_LENGTH)))).getBytes()).description())
                .hasSize(NrmService.MAX_DESCRIPTION_LENGTH);
    }

    // --- a .nrm without a dataset (version 2) ---

    private static final String INFO_V2 = "{\"version\":2,\"name\":\"Sem dados\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}";

    private static Map<String, byte[]> entriesWithoutDataset(String model, String info) {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("modelo.json", model.getBytes(StandardCharsets.UTF_8));
        entries.put("info.json", info.getBytes(StandardCharsets.UTF_8));
        return entries;
    }

    @Test
    void aNrmWithoutADatasetImportsRunsAndHasNoDataset() throws IOException {
        NrmImportStatus imported = nrmService.importNrm(nrm("a.nrm", entriesWithoutDataset(MODEL_WITH_INPUT, INFO_V2)));

        assertThat(nrmService.getInputs(imported.nrmId()).inputs()).singleElement();
        assertThat(nrmService.run(imported.nrmId(), Map.of("b", "x"))).singleElement().satisfies(result -> {
            assertThat(result.success()).isTrue();
            assertThat(result.value()).isEqualTo("x");
        });
        assertThatThrownBy(() -> nrmService.getDataset(imported.nrmId())).isInstanceOf(IllegalArgumentException.class);
        assertThat(nrmService.inspect(nrm("a.nrm", entriesWithoutDataset(MODEL_WITH_INPUT, INFO_V2)).getBytes()).datasetFilename()).isNull();
    }

    @Test
    void aVersionOneNrmStillNeedsItsDataset() throws IOException {
        assertRejected(entriesWithoutDataset(MODEL_WITH_INPUT, INFO));
    }

    @Test
    void aNrmWithoutADatasetCannotHoldAnOperationThatReadsOne() {
        assertThatThrownBy(() -> nrmService.validate(nrm("a.nrm", entriesWithoutDataset(MODEL, INFO_V2))))
                .isInstanceOf(ModelDatasetMismatchException.class)
                .hasMessageContaining("needs a dataset");
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
