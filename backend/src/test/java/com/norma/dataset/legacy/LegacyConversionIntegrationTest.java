package com.norma.dataset.legacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.norma.dataset.library.NrmLibraryService;
import com.norma.dataset.library.SavedNrmRepository;
import com.norma.dataset.library.SavedNrmSummary;
import com.norma.dataset.service.NrmService;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

/** The conversion of a saved norma end to end: a real library, a real file store and saved baselines. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class LegacyConversionIntegrationTest {

    /** Two inputs, a two-value calc (absolute difference) and a counter over both: all in the old shape. */
    private static final String MODEL = """
            {"version":1,"modelName":"M","inputOperationIds":["n1","n2"],"outputOperationIds":["c","k"],
             "operations":[
              {"id":"n1","kind":"node","name":"A","fields":{"input":{"type":"literal","value":""}},"position":{"x":0,"y":0},"operations":[
                {"id":"c","kind":"calc","name":"Diferença","fields":{"a":{"type":"reference","operationId":"n1"},"b":{"type":"reference","operationId":"n2"},"operation":"subtract","format":"abs"},"position":{"x":1,"y":1},"operations":[]},
                {"id":"k","kind":"counter","name":"Total","fields":{"inputs":[{"type":"reference","operationId":"n1"},{"type":"reference","operationId":"n2"}]},"position":{"x":2,"y":2},"operations":[]}]},
              {"id":"n2","kind":"node","name":"B","fields":{"input":{"type":"literal","value":""}},"position":{"x":3,"y":3},"operations":[]}]}""";
    private static final String INFO = "{\"version\":2,\"name\":\"Antigo\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}";

    private static final EmbeddedPostgres POSTGRES = startPostgres();
    private static final Path STORAGE = tempDirectory("norma-conv-store");
    private static final Path BASELINES = tempDirectory("norma-conv-baseline");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "postgres");
        registry.add("norma.storage.dir", STORAGE::toString);
        registry.add("norma.baseline.dir", BASELINES::toString);
    }

    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    private LegacyConversionService conversion;
    @Autowired
    private NrmLibraryService library;
    @Autowired
    private NrmService nrmService;
    @Autowired
    private SavedNrmRepository repository;

    @BeforeEach
    void emptyEverything() throws IOException {
        repository.deleteAll();
        for (Path directory : List.of(STORAGE, BASELINES)) {
            try (Stream<Path> files = Files.list(directory)) {
                for (Path file : (Iterable<Path>) files::iterator) {
                    Files.delete(file);
                }
            }
        }
    }

    @Test
    void aDryRunChecksTheConversionWithoutChangingTheSavedNorma() throws Exception {
        UUID id = saveOldNorma();
        saveBaselineFrom(id);

        ConversionReport report = conversion.convert(id, true);

        assertThat(report.status()).isEqualTo("verified");
        assertThat(report.counters()).isEqualTo(1);
        assertThat(report.calcs()).isEqualTo(1);
        assertThat(report.cases()).isEqualTo(3);
        assertThat(report.problems()).isEmpty();
        assertThat(modelOf(library.file(id).bytes())).contains("\"counter\"");
    }

    @Test
    void aVerifiedNormaIsConvertedKeepingItsIdItsCountsAndItsDatasetEntries() throws Exception {
        UUID id = saveOldNorma();
        saveBaselineFrom(id);
        SavedNrmSummary before = library.get(id);

        ConversionReport report = conversion.convert(id, false);

        assertThat(report.status()).isEqualTo("converted");
        String model = modelOf(library.file(id).bytes());
        assertThat(model).doesNotContain("\"counter\"");
        assertThat(model).contains("\"inputs\"");
        SavedNrmSummary after = library.get(id);
        assertThat(after.id()).isEqualTo(before.id());
        assertThat(after.operationCount()).isEqualTo(before.operationCount());
        assertThat(after.inputCount()).isEqualTo(before.inputCount());
        assertThat(after.outputCount()).isEqualTo(before.outputCount());
        assertThat(after.createdAt()).isEqualTo(before.createdAt());
    }

    @Test
    void aConvertedNormaCarriesNoVersionInItsInfoOrItsModelAndStillOpens() throws Exception {
        UUID id = saveOldNorma();
        saveBaselineFrom(id);
        assertThat(infoOf(library.file(id).bytes())).contains("\"version\"");

        conversion.convert(id, false);

        byte[] converted = library.file(id).bytes();
        assertThat(infoOf(converted)).doesNotContain("version");
        assertThat(modelOf(converted)).doesNotContain("\"version\"");
        assertThat(library.open(id).nrmId()).isNotBlank();
    }

    @Test
    void aNormaThatOnlyHasVersionsToDropIsStillConverted() throws Exception {
        String plain = "{\"version\":1,\"modelName\":\"P\",\"inputOperationIds\":[\"n\"],\"outputOperationIds\":[\"n\"],\"operations\":["
                + "{\"id\":\"n\",\"kind\":\"node\",\"name\":\"N\",\"fields\":{\"input\":{\"type\":\"literal\",\"value\":\"\"}},\"operations\":[]}]}";
        UUID id = library.save(zip(plain), null).id();
        saveBaselineFrom(id, plain);

        ConversionReport report = conversion.convert(id, false);

        assertThat(report.status()).isEqualTo("converted");
        assertThat(report.version()).isTrue();
        assertThat(infoOf(library.file(id).bytes())).doesNotContain("version");
    }

    @Test
    void convertingAgainChangesNothing() throws Exception {
        UUID id = saveOldNorma();
        saveBaselineFrom(id);
        conversion.convert(id, false);
        byte[] converted = library.file(id).bytes();

        ConversionReport again = conversion.convert(id, false);

        assertThat(again.status()).isEqualTo("unchanged");
        assertThat(library.file(id).bytes()).isEqualTo(converted);
    }

    @Test
    void aNormaWhoseResultsWouldDifferIsLeftAsItWasAndTheDifferenceIsReported() throws Exception {
        UUID id = saveOldNorma();
        byte[] original = library.file(id).bytes();
        saveBaselineFrom(id);
        // The norma "used to" say 99 for the counter in the second case.
        ObjectNode baseline = (ObjectNode) mapper.readTree(BASELINES.resolve(id + ".json").toFile());
        for (JsonNode result : baseline.path("cases").get(1).path("response").path("results")) {
            if ("k".equals(result.path("id").asText())) {
                ((ObjectNode) result).put("value", 99);
            }
        }
        mapper.writeValue(BASELINES.resolve(id + ".json").toFile(), baseline);

        ConversionReport report = conversion.convert(id, false);

        assertThat(report.status()).isEqualTo("failed");
        assertThat(report.problems()).isNotEmpty();
        assertThat(report.problems().get(0)).contains("Total").contains("99");
        assertThat(library.file(id).bytes()).isEqualTo(original);
    }

    @Test
    void aNormaWithNoSavedBaselineIsNeverConverted() throws Exception {
        UUID id = saveOldNorma();
        byte[] original = library.file(id).bytes();

        ConversionReport report = conversion.convert(id, false);

        assertThat(report.status()).isEqualTo("failed");
        assertThat(report.problems().get(0)).contains("baseline");
        assertThat(library.file(id).bytes()).isEqualTo(original);
    }

    @Test
    void aNormaWithNothingToConvertIsLeftAlone() throws Exception {
        String plain = "{\"modelName\":\"P\",\"inputOperationIds\":[\"n\"],\"outputOperationIds\":[\"n\"],\"operations\":["
                + "{\"id\":\"n\",\"kind\":\"node\",\"name\":\"N\",\"fields\":{\"input\":{\"type\":\"literal\",\"value\":\"\"}},\"operations\":[]}]}";
        UUID id = library.save(zip(plain, "{\"name\":\"Novo\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}"), null).id();
        byte[] original = library.file(id).bytes();

        ConversionReport report = conversion.convert(id, false);

        assertThat(report.status()).isEqualTo("unchanged");
        assertThat(library.file(id).bytes()).isEqualTo(original);
    }

    private UUID saveOldNorma() throws IOException {
        return library.save(zip(MODEL), null).id();
    }

    /** What the norma answers now, in the cases the saved baselines hold: the same shape the app's own script saves. */
    private void saveBaselineFrom(UUID id, String model) throws Exception {
        String nrmId = nrmService.open("old.nrm", library.file(id).bytes(), Instant.now(), Instant.now()).nrmId();
        ObjectNode baseline = mapper.createObjectNode();
        baseline.putArray("operations").addObject().put("id", "n");
        ObjectNode entry = baseline.putArray("cases").addObject();
        entry.put("case", "only");
        entry.set("inputValues", mapper.valueToTree(Map.of("n", "x")));
        entry.set("response", mapper.readTree(mapper.writeValueAsString(nrmService.runWatching(nrmId, Map.of("n", "x"), List.of("n")))));
        mapper.writeValue(BASELINES.resolve(id + ".json").toFile(), baseline);
    }

    private void saveBaselineFrom(UUID id) throws Exception {
        String nrmId = nrmService.open("old.nrm", library.file(id).bytes(), Instant.now(), Instant.now()).nrmId();
        ObjectNode baseline = mapper.createObjectNode();
        ArrayNode operations = baseline.putArray("operations");
        List<String> ids = List.of("n1", "n2", "c", "k");
        ids.forEach(operationId -> operations.addObject().put("id", operationId));
        ArrayNode cases = baseline.putArray("cases");
        Map<String, Map<String, String>> inputs = new LinkedHashMap<>();
        inputs.put("empty", Map.of());
        inputs.put("ten-three", Map.of("n1", "10", "n2", "3"));
        inputs.put("two-nine", Map.of("n1", "2", "n2", "9"));
        for (Map.Entry<String, Map<String, String>> testCase : inputs.entrySet()) {
            ObjectNode entry = cases.addObject();
            entry.put("case", testCase.getKey());
            entry.set("inputValues", mapper.valueToTree(testCase.getValue()));
            String response = mapper.writeValueAsString(nrmService.runWatching(nrmId, testCase.getValue(), ids));
            entry.set("response", mapper.readTree(response));
        }
        mapper.writeValue(BASELINES.resolve(id + ".json").toFile(), baseline);
    }

    private static byte[] zip(String model) throws IOException {
        return zip(model, INFO);
    }

    private static byte[] zip(String model, String info) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream out = new ZipOutputStream(bytes)) {
            out.putNextEntry(new ZipEntry("modelo.json"));
            out.write(model.getBytes(StandardCharsets.UTF_8));
            out.closeEntry();
            out.putNextEntry(new ZipEntry("info.json"));
            out.write(info.getBytes(StandardCharsets.UTF_8));
            out.closeEntry();
        }
        return bytes.toByteArray();
    }

    private static String infoOf(byte[] nrm) throws IOException {
        try (ZipInputStream in = new ZipInputStream(new java.io.ByteArrayInputStream(nrm))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (entry.getName().equals("info.json")) {
                    return new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        throw new IllegalStateException("no info");
    }

    private static String modelOf(byte[] nrm) throws IOException {
        try (ZipInputStream in = new ZipInputStream(new java.io.ByteArrayInputStream(nrm))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (entry.getName().equals("modelo.json")) {
                    return new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        throw new IllegalStateException("no model");
    }

    private static EmbeddedPostgres startPostgres() {
        try {
            return EmbeddedPostgres.start();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Path tempDirectory(String prefix) {
        try {
            return Files.createTempDirectory(prefix);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
