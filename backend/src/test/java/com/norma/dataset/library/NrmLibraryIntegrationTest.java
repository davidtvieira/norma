package com.norma.dataset.library;

import com.norma.dataset.dto.NrmOpenResponse;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The library end to end: real HTTP requests, a real PostgreSQL (started in-process) and a real storage
 * folder, so the Flyway migration, the JPA mapping and the file handling are all exercised together.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NrmLibraryIntegrationTest {

    private static final String MODEL = """
            {"version":1,"modelName":"M","datasetId":"d","inputOperationIds":["b"],"outputOperationIds":["b"],
             "operations":[{"id":"b","kind":"node","name":"Valor",
               "fields":{"input":{"type":"literal","value":""}},"operations":[]}]}""";
    private static final String INFO = "{\"version\":1,\"name\":\"%s\",\"createdAt\":\"2026-10-19T13:04:00.000Z\"}";

    private static final EmbeddedPostgres POSTGRES = startPostgres();
    private static final Path STORAGE = createStorage();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "postgres");
        registry.add("norma.storage.dir", STORAGE::toString);
    }

    @Autowired
    private TestRestTemplate http;
    @Autowired
    private SavedNrmRepository repository;

    @BeforeEach
    void emptyTheLibrary() throws IOException {
        repository.deleteAll();
        try (Stream<Path> files = Files.list(STORAGE)) {
            for (Path file : (Iterable<Path>) files::iterator) {
                Files.delete(file);
            }
        }
    }

    @Test
    void savedNrmIsListedWithWhatItSaysAboutItselfAndItsFileIsKept() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");

        assertThat(saved.name()).isEqualTo("Vendas");
        assertThat(saved.datasetFilename()).isEqualTo("dados.xlsx");
        assertThat(saved.operationCount()).isEqualTo(1);
        assertThat(saved.inputCount()).isEqualTo(1);
        assertThat(saved.outputCount()).isEqualTo(1);
        assertThat(saved.available()).isTrue();
        assertThat(STORAGE.resolve(saved.id() + ".nrm")).isRegularFile();

        SavedNrmSummary[] listed = http.getForObject("/api/v1/library", SavedNrmSummary[].class);
        assertThat(listed).extracting(SavedNrmSummary::id).containsExactly(saved.id());
    }

    @Test
    void downloadingGivesTheExactBytesUnderTheModelsName() throws IOException {
        byte[] bytes = nrmBytes("Vendas Q1/2026", "dados.xlsx");
        SavedNrmSummary saved = upload(bytes).getBody();

        ResponseEntity<byte[]> file = http.getForEntity("/api/v1/library/" + saved.id() + "/file", byte[].class);

        assertThat(file.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(file.getBody()).isEqualTo(bytes);
        assertThat(file.getHeaders().getContentDisposition().getFilename()).isEqualTo("Vendas Q1_2026.nrm");
    }

    @Test
    void replacingKeepsTheIdAndCreationDateAndChangesTheRest() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");

        MultiValueMap<String, Object> body = filePart(nrmBytes("Vendas 2", "novos.xlsx"));
        ResponseEntity<SavedNrmSummary> replaced = http.exchange(
                "/api/v1/library/" + saved.id(), HttpMethod.PUT, multipart(body), SavedNrmSummary.class);

        assertThat(replaced.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(replaced.getBody().id()).isEqualTo(saved.id());
        assertThat(replaced.getBody().name()).isEqualTo("Vendas 2");
        assertThat(replaced.getBody().datasetFilename()).isEqualTo("novos.xlsx");
        assertThat(replaced.getBody().createdAt()).isEqualTo(saved.createdAt());
        assertThat(replaced.getBody().updatedAt()).isAfterOrEqualTo(saved.updatedAt());
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void openingImportsTheSavedFileWithoutUploadingIt() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");

        ResponseEntity<NrmOpenResponse> opened = http.postForEntity(
                "/api/v1/library/" + saved.id() + "/open", null, NrmOpenResponse.class);

        assertThat(opened.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(opened.getBody().nrmId()).isNotBlank();
        assertThat(opened.getBody().name()).isEqualTo("Vendas");
        assertThat(opened.getBody().datasetFilename()).isEqualTo("dados.xlsx");
        assertThat(http.getForEntity("/api/v1/nrm/" + opened.getBody().nrmId() + "/dataset", String.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(http.postForEntity("/api/v1/library/" + UUID.randomUUID() + "/open", null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void replacingWithKeepNameLeavesTheListedNameAlone() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");

        MultiValueMap<String, Object> body = filePart(nrmBytes("Outro nome", "dados.xlsx"));
        ResponseEntity<SavedNrmSummary> replaced = http.exchange(
                "/api/v1/library/" + saved.id() + "?keepName=true", HttpMethod.PUT, multipart(body), SavedNrmSummary.class);

        assertThat(replaced.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(replaced.getBody().name()).isEqualTo("Vendas");
        assertThat(http.getForEntity("/api/v1/library/" + saved.id() + "/file", byte[].class).getBody())
                .isEqualTo(nrmBytes("Outro nome", "dados.xlsx"));
    }

    @Test
    void deletingRemovesTheEntryAndItsFile() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");

        ResponseEntity<Void> deleted = http.exchange(
                "/api/v1/library/" + saved.id(), HttpMethod.DELETE, null, Void.class);

        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(repository.count()).isZero();
        assertThat(STORAGE.resolve(saved.id() + ".nrm")).doesNotExist();
        assertThat(http.getForEntity("/api/v1/library/" + saved.id() + "/file", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void anInvalidFileIsRejectedAndNothingIsKept() {
        ResponseEntity<String> response = http.postForEntity(
                "/api/v1/library", multipart(filePart(new byte[] {1, 2, 3})), String.class);

        assertThat(response.getStatusCode().is4xxClientError()).isTrue();
        assertThat(repository.count()).isZero();
        assertThat(STORAGE.toFile().list()).isEmpty();
    }

    @Test
    void anEntryWhoseFileIsGoneIsListedAsUnavailableAndCannotBeDownloaded() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");
        Files.delete(STORAGE.resolve(saved.id() + ".nrm"));

        SavedNrmSummary[] listed = http.getForObject("/api/v1/library", SavedNrmSummary[].class);
        assertThat(listed).singleElement().satisfies(entry -> assertThat(entry.available()).isFalse());
        assertThat(http.getForEntity("/api/v1/library/" + saved.id() + "/file", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void searchKeepsTheModelsWhoseNameOrDatasetFileContainsTheTextInAnyCase() throws IOException {
        save("Vendas Norte", "norte.xlsx");
        save("Compras", "fornecedores.xlsx");
        save("Stock 100%", "armazem_1.xlsx");

        assertThat(names("search=VENDAS")).containsExactly("Vendas Norte");
        assertThat(names("search=forneced")).containsExactly("Compras");
        // % and _ only match themselves, not "anything".
        assertThat(names("search=100%25")).containsExactly("Stock 100%");
        assertThat(names("search=armazem_")).containsExactly("Stock 100%");
        assertThat(names("search=%25")).containsExactly("Stock 100%");
        assertThat(names("search=nada")).isEmpty();
        assertThat(names("search=")).hasSize(3);
    }

    @Test
    void theListIsOrderedBySortAndDirectionAndByDefaultNewestFirst() throws IOException {
        save("Banana", "b.xlsx", 50);
        save("Abacate", "a.xlsx", 1);
        save("Cereja", "c.xlsx", 200);

        assertThat(names("")).containsExactly("Cereja", "Abacate", "Banana"); // most recently saved first
        assertThat(names("sort=name")).containsExactly("Abacate", "Banana", "Cereja"); // A to Z for the name
        assertThat(names("sort=name&direction=desc")).containsExactly("Cereja", "Banana", "Abacate");
        assertThat(names("sort=sizeBytes")).containsExactly("Cereja", "Banana", "Abacate"); // biggest first
        assertThat(names("sort=sizeBytes&direction=asc")).containsExactly("Abacate", "Banana", "Cereja");
        assertThat(names("sort=updatedAt&direction=asc")).containsExactly("Banana", "Abacate", "Cereja");
        assertThat(names("sort=NAME&direction=DESC&search=a")).containsExactly("Cereja", "Banana", "Abacate");
    }

    @Test
    void anUnknownSortOrDirectionIsRejected() {
        assertThat(http.getForEntity("/api/v1/library?sort=colour", String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.getForEntity("/api/v1/library?direction=sideways", String.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private List<String> names(String query) {
        // A URI, not a string: a string is run through URI templating, which would encode the "%" of "%25" a second time.
        URI uri = URI.create(http.getRootUri() + "/api/v1/library" + (query.isEmpty() ? "" : "?" + query));
        SavedNrmSummary[] listed = http.getForObject(uri, SavedNrmSummary[].class);
        return Arrays.stream(listed).map(SavedNrmSummary::name).toList();
    }

    private SavedNrmSummary save(String name, String datasetFilename, int rows) throws IOException {
        ResponseEntity<SavedNrmSummary> response = upload(nrmBytes(name, datasetFilename, rows));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody();
    }

    private SavedNrmSummary save(String name, String datasetFilename) throws IOException {
        ResponseEntity<SavedNrmSummary> response = upload(nrmBytes(name, datasetFilename));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody();
    }

    private ResponseEntity<SavedNrmSummary> upload(byte[] bytes) {
        return http.postForEntity("/api/v1/library", multipart(filePart(bytes)), SavedNrmSummary.class);
    }

    private static MultiValueMap<String, Object> filePart(byte[] bytes) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return "modelo.nrm";
            }
        });
        return body;
    }

    private static HttpEntity<MultiValueMap<String, Object>> multipart(MultiValueMap<String, Object> body) {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return new HttpEntity<>(body, headers);
    }

    private static byte[] nrmBytes(String name, String datasetFilename) throws IOException {
        return nrmBytes(name, datasetFilename, 1);
    }

    private static byte[] nrmBytes(String name, String datasetFilename, int rows) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(datasetFilename, workbookBytes(rows));
        entries.put("modelo.json", MODEL.getBytes(StandardCharsets.UTF_8));
        entries.put("info.json", INFO.formatted(name).getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static byte[] workbookBytes(int rows) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Sheet1");
            for (int row = 0; row < rows; row++) {
                sheet.createRow(row).createCell(0).setCellValue("ID " + row + " " + "x".repeat(40));
            }
            workbook.write(out);
            return out.toByteArray();
        }
    }

    private static EmbeddedPostgres startPostgres() {
        try {
            return EmbeddedPostgres.start();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Path createStorage() {
        try {
            return Files.createTempDirectory("norma-nrm-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
