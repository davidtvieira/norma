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
    @Autowired
    private NrmLibraryService library;
    @Autowired
    private CategoryRepository categoryRepository;

    @BeforeEach
    void emptyTheLibrary() throws IOException {
        repository.deleteAll();
        // Leaves first: a subcategory points at its parent.
        while (categoryRepository.count() > 0) {
            List<Category> all = categoryRepository.findAll();
            java.util.Set<UUID> parents = new java.util.HashSet<>();
            all.forEach(category -> parents.add(category.getParentId()));
            categoryRepository.deleteAll(all.stream().filter(category -> !parents.contains(category.getId())).toList());
        }
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

        SavedNrmSummary[] listed = http.getForObject("/api/v1/library", LibraryListing.class).normas().toArray(new SavedNrmSummary[0]);
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
        assertThat(opened.getBody().createdAt()).isEqualTo(saved.createdAt());
        assertThat(opened.getBody().updatedAt()).isEqualTo(saved.updatedAt());
        assertThat(http.getForEntity("/api/v1/nrm/" + opened.getBody().nrmId() + "/dataset", String.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(http.postForEntity("/api/v1/library/" + UUID.randomUUID() + "/open", null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void startingUpPutsTheNameInsideEachFileAsTheListedName() throws IOException {
        SavedNrmSummary saved = save("Vendas", "dados.xlsx");
        SavedNrm stale = repository.findById(saved.id()).orElseThrow();
        stale.rename("Nome antigo");
        repository.saveAndFlush(stale);

        library.syncNamesWithFiles();

        assertThat(repository.findById(saved.id()).orElseThrow().getName()).isEqualTo("Vendas");
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

        SavedNrmSummary[] listed = http.getForObject("/api/v1/library", LibraryListing.class).normas().toArray(new SavedNrmSummary[0]);
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

    @Test
    void categoriesFormATwoLevelTreeWithCounts() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        createCategory("Pessoal", null);
        SavedNrmSummary a = save("A", "a.xlsx");
        SavedNrmSummary b = save("B", "b.xlsx");
        assignCategory(a.id(), fiscal.id());
        assignCategory(b.id(), iva.id());

        CategoryNode[] tree = http.getForObject("/api/v1/categories", CategoryNode[].class);

        assertThat(tree).extracting(CategoryNode::name).containsExactly("Fiscal", "Pessoal");
        assertThat(tree[0].normaCount()).isEqualTo(1);
        assertThat(tree[0].totalCount()).isEqualTo(2);
        assertThat(tree[0].children()).singleElement().satisfies(child -> {
            assertThat(child.name()).isEqualTo("IVA");
            assertThat(child.parentId()).isEqualTo(fiscal.id());
            assertThat(child.normaCount()).isEqualTo(1);
        });
        assertThat(tree[1].totalCount()).isZero();
    }

    @Test
    void categoriesGoFourLevelsDeepAndNamesAreUniqueAmongSiblings() {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        CategoryNode trimestral = createCategory("Trimestral", iva.id()).getBody();
        CategoryNode q1 = createCategory("Q1", trimestral.id()).getBody();

        assertThat(createCategory("fiscal", null).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(createCategory("Iva", fiscal.id()).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(createCategory("IVA", null).getStatusCode()).isEqualTo(HttpStatus.CREATED); // another level
        assertThat(createCategory("Mensal", q1.id()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST); // a fifth level
        assertThat(createCategory("  ", null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(createCategory("X", UUID.randomUUID()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        CategoryNode[] tree = http.getForObject("/api/v1/categories", CategoryNode[].class);
        CategoryNode deepest = tree[0].children().get(0).children().get(0).children().get(0);
        assertThat(tree[0].name()).isEqualTo("Fiscal");
        assertThat(deepest.name()).isEqualTo("Q1");
    }

    @Test
    void aCategoryNameIsAtMostFiftyCharacters() {
        assertThat(createCategory("a".repeat(50), null).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(createCategory("b".repeat(51), null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Counted in characters, not bytes: 50 accented letters fit.
        assertThat(createCategory("é".repeat(50), null).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        CategoryNode ok = createCategory("curto", null).getBody();
        assertThat(putCategory(ok.id(), "c".repeat(51), null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Spaces around it are not part of the name.
        assertThat(createCategory("  " + "d".repeat(50) + "  ", null).getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void aCategoryCanBeRenamedAndMovedWithItsSubtreeButNotTooDeepOrIntoItself() {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode pessoal = createCategory("Pessoal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        CategoryNode trimestral = createCategory("Trimestral", iva.id()).getBody();

        ResponseEntity<CategoryNode> moved = putCategory(iva.id(), "IRS", pessoal.id());
        assertThat(moved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(moved.getBody().name()).isEqualTo("IRS");
        assertThat(moved.getBody().parentId()).isEqualTo(pessoal.id());
        // Its subcategory went with it.
        CategoryNode[] tree = http.getForObject("/api/v1/categories", CategoryNode[].class);
        assertThat(tree[1].children().get(0).children()).extracting(CategoryNode::id).containsExactly(trimestral.id());

        // Under itself or its own subcategory: refused.
        assertThat(putCategory(pessoal.id(), "Pessoal", pessoal.id()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(putCategory(pessoal.id(), "Pessoal", trimestral.id()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // Pessoal (3 levels with its subtree) cannot go under a level-2 category: it would be 5 deep.
        CategoryNode ambiente = createCategory("Ambiente", fiscal.id()).getBody();
        assertThat(putCategory(pessoal.id(), "Pessoal", ambiente.id()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Under a top-level category it fits exactly (1 + 3 = 4).
        CategoryNode outro = createCategory("Outro", null).getBody();
        assertThat(putCategory(pessoal.id(), "Pessoal", outro.id()).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void deletingACategoryDeletesItsSubcategoriesAndLeavesItsNormasUncategorized() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        CategoryNode trimestral = createCategory("Trimestral", iva.id()).getBody();
        CategoryNode pessoal = createCategory("Pessoal", null).getBody();
        SavedNrmSummary a = save("A", "a.xlsx");
        SavedNrmSummary b = save("B", "b.xlsx");
        SavedNrmSummary c = save("C", "c.xlsx");
        SavedNrmSummary kept = save("Kept", "k.xlsx");
        assignCategory(a.id(), fiscal.id());
        assignCategory(b.id(), iva.id());
        assignCategory(c.id(), trimestral.id());
        assignCategory(kept.id(), pessoal.id());

        assertThat(deleteCategory(fiscal.id())).isEqualTo(HttpStatus.NO_CONTENT);

        // Fiscal and everything inside it is gone; the normas that were in any of them are under no category.
        CategoryNode[] tree = http.getForObject("/api/v1/categories", CategoryNode[].class);
        assertThat(tree).extracting(CategoryNode::name).containsExactly("Pessoal");
        assertThat(names("")).containsExactlyInAnyOrder("A", "B", "C");
        assertThat(names("categoryId=" + pessoal.id())).containsExactly("Kept"); // another category is left alone
        assertThat(repository.count()).isEqualTo(4); // no norma was deleted
        assertThat(STORAGE.toFile().list()).hasSize(4);
        // Their dates did not change.
        assertThat(http.getForObject("/api/v1/library?sort=name", LibraryListing.class).normas())
                .extracting(SavedNrmSummary::updatedAt).containsExactly(a.updatedAt(), b.updatedAt(), c.updatedAt());

        assertThat(deleteCategory(fiscal.id())).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void deletingASubcategoryKeepsItsParentAndSiblings() {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        createCategory("IRS", fiscal.id());

        assertThat(deleteCategory(iva.id())).isEqualTo(HttpStatus.NO_CONTENT);

        CategoryNode[] tree = http.getForObject("/api/v1/categories", CategoryNode[].class);
        assertThat(tree).extracting(CategoryNode::name).containsExactly("Fiscal");
        assertThat(tree[0].children()).extracting(CategoryNode::name).containsExactly("IRS");
    }

    @Test
    void filingANormaKeepsItsFileAndDatesAndTheListCanBeFilteredByCategory() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        CategoryNode pessoal = createCategory("Pessoal", null).getBody();
        SavedNrmSummary a = save("A", "a.xlsx");
        save("B", "b.xlsx");
        SavedNrmSummary c = save("C", "c.xlsx");
        SavedNrmSummary filed = assignCategory(a.id(), fiscal.id()).getBody();
        assignCategory(c.id(), iva.id());

        assertThat(filed.categoryId()).isEqualTo(fiscal.id());
        assertThat(filed.updatedAt()).isEqualTo(a.updatedAt());
        CategoryNode trimestral = createCategory("Trimestral", iva.id()).getBody();
        SavedNrmSummary d = save("D", "d.xlsx");
        assignCategory(d.id(), trimestral.id());

        // A folder lists only the normas filed right in it, never those in the folders inside it.
        assertThat(names("categoryId=" + fiscal.id())).containsExactly("A");
        assertThat(names("categoryId=" + iva.id())).containsExactly("C");
        assertThat(names("categoryId=" + trimestral.id())).containsExactly("D");
        assertThat(names("categoryId=" + pessoal.id())).isEmpty();
        assertThat(names("")).containsExactly("B");
        assertThat(names("categoryId=" + iva.id() + "&search=c")).containsExactly("C");
        assertThat(names("categoryId=" + fiscal.id() + "&search=c")).isEmpty();
        assertThat(http.getForEntity("/api/v1/library?categoryId=" + UUID.randomUUID(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.getForObject("/api/v1/library", LibraryListing.class).total()).isEqualTo(4);
        assertThat(assignCategory(a.id(), UUID.randomUUID()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void aNormaCanBeSavedStraightIntoACategory() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        MultiValueMap<String, Object> body = filePart(nrmBytes("A", "a.xlsx"));
        body.add("categoryId", fiscal.id().toString());

        ResponseEntity<SavedNrmSummary> saved = http.postForEntity("/api/v1/library", multipart(body), SavedNrmSummary.class);

        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(saved.getBody().categoryId()).isEqualTo(fiscal.id());

        // Replacing the file keeps the category.
        ResponseEntity<SavedNrmSummary> replaced = http.exchange("/api/v1/library/" + saved.getBody().id(), HttpMethod.PUT,
                multipart(filePart(nrmBytes("A2", "a.xlsx"))), SavedNrmSummary.class);
        assertThat(replaced.getBody().categoryId()).isEqualTo(fiscal.id());

        MultiValueMap<String, Object> unknown = filePart(nrmBytes("B", "b.xlsx"));
        unknown.add("categoryId", UUID.randomUUID().toString());
        assertThat(http.postForEntity("/api/v1/library", multipart(unknown), String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(repository.count()).isEqualTo(1);
        assertThat(STORAGE.toFile().list()).hasSize(1);
    }

    @Test
    void theListingHoldsTheCategoriesAndTheNormasOfOneLevel() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA", fiscal.id()).getBody();
        CategoryNode trimestral = createCategory("Trimestral", iva.id()).getBody();
        createCategory("Pessoal", null);
        SavedNrmSummary loose = save("Solta", "s.xlsx");
        SavedNrmSummary inFiscal = save("Em fiscal", "f.xlsx");
        SavedNrmSummary inIva = save("Em iva", "i.xlsx");
        SavedNrmSummary inTrimestral = save("Em trimestral", "t.xlsx");
        assignCategory(inFiscal.id(), fiscal.id());
        assignCategory(inIva.id(), iva.id());
        assignCategory(inTrimestral.id(), trimestral.id());

        // No category: the top level — its categories and the normas filed under none.
        LibraryListing top = listing("");
        assertThat(top.categories()).extracting(FolderEntry::name).containsExactly("Fiscal", "Pessoal");
        assertThat(top.normas()).extracting(SavedNrmSummary::name).containsExactly("Solta");
        assertThat(top.total()).isEqualTo(4);
        FolderEntry fiscalEntry = top.categories().get(0);
        assertThat(fiscalEntry.path()).containsExactly("Fiscal");
        assertThat(fiscalEntry.normaCount()).isEqualTo(1);
        assertThat(fiscalEntry.totalCount()).isEqualTo(3); // itself plus the folders inside it
        assertThat(fiscalEntry.childCount()).isEqualTo(1);

        // A category: its direct subcategories and the normas filed right in it, not what is deeper.
        LibraryListing inside = listing("categoryId=" + fiscal.id());
        assertThat(inside.categories()).extracting(FolderEntry::name).containsExactly("IVA");
        assertThat(inside.normas()).extracting(SavedNrmSummary::name).containsExactly("Em fiscal");
        assertThat(inside.total()).isEqualTo(4);
        // Where the listing is: the path to the category being looked into, itself last (with the id to go back to each step).
        assertThat(top.path()).isEmpty();
        List<PathStep> path = listing("categoryId=" + iva.id()).path();
        assertThat(path).extracting(PathStep::name).containsExactly("Fiscal", "IVA");
        assertThat(path).extracting(PathStep::id).containsExactly(fiscal.id(), iva.id());
        // A norma says where it is filed.
        assertThat(listing("categoryId=" + trimestral.id()).normas().get(0).categoryPath()).containsExactly("Fiscal", "IVA", "Trimestral");
        assertThat(top.normas().get(0).categoryPath()).isEmpty();
        assertThat(listing("everywhere=true").path()).isEmpty();
        assertThat(listing("categoryId=" + trimestral.id()).categories()).isEmpty();
        assertThat(http.getForEntity("/api/v1/library?categoryId=" + UUID.randomUUID(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(loose.id()).isNotNull();
    }

    @Test
    void searchingMatchesCategoryNamesAndNormasAtTheLevelOrEverywhere() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA fiscal", fiscal.id()).getBody();
        createCategory("Pessoal", null);
        SavedNrmSummary a = save("Mapa fiscal", "a.xlsx");
        SavedNrmSummary b = save("Mapa fiscal 2", "b.xlsx");
        SavedNrmSummary c = save("Outro", "c.xlsx");
        assignCategory(b.id(), fiscal.id());
        assignCategory(c.id(), iva.id());

        // At the top level, without everywhere: the top level's categories and normas that match.
        LibraryListing top = listing("search=FISCAL");
        assertThat(top.categories()).extracting(FolderEntry::name).containsExactly("Fiscal");
        assertThat(top.normas()).extracting(SavedNrmSummary::name).containsExactly("Mapa fiscal");
        // Inside a category: its direct subcategories and normas that match.
        LibraryListing inside = listing("search=fiscal&categoryId=" + fiscal.id());
        assertThat(inside.categories()).extracting(FolderEntry::name).containsExactly("IVA fiscal");
        assertThat(inside.normas()).extracting(SavedNrmSummary::name).containsExactly("Mapa fiscal 2");
        // Everywhere: every category and norma that matches, at any depth, the category with its whole path.
        LibraryListing everywhere = listing("search=fiscal&everywhere=true");
        assertThat(everywhere.categories()).extracting(FolderEntry::name).containsExactly("Fiscal", "IVA fiscal");
        assertThat(everywhere.categories().get(1).path()).containsExactly("Fiscal", "IVA fiscal");
        assertThat(everywhere.normas()).extracting(SavedNrmSummary::name).containsExactlyInAnyOrder("Mapa fiscal", "Mapa fiscal 2");
        // Everywhere with no search: all of it.
        LibraryListing all = listing("everywhere=true");
        assertThat(all.categories()).hasSize(3);
        assertThat(all.normas()).hasSize(3);
        assertThat(a.id()).isNotNull();
    }

    @Test
    void exportingGivesEveryFileInAZipLaidOutLikeTheFolders() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        CategoryNode iva = createCategory("IVA/2026", fiscal.id()).getBody(); // a "/" in a name must not become a folder
        byte[] a = nrmBytes("Mapa", "a.xlsx");
        byte[] b = nrmBytes("Solta", "b.xlsx", 3);
        byte[] twin = nrmBytes("Solta", "c.xlsx", 5);
        SavedNrmSummary inIva = upload(a).getBody();
        SavedNrmSummary loose = upload(b).getBody();
        SavedNrmSummary looseTwin = upload(twin).getBody();
        assignCategory(inIva.id(), iva.id());

        ResponseEntity<byte[]> response = http.getForEntity("/api/v1/library/export", byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("normas.zip");
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(response.getBody()))) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        assertThat(entries.keySet()).containsExactlyInAnyOrder("Fiscal/IVA_2026/Mapa.nrm", "Solta.nrm", "Solta (2).nrm");
        assertThat(entries.get("Fiscal/IVA_2026/Mapa.nrm")).isEqualTo(a);
        // The two files sharing a name both made it, as the library keeps them.
        assertThat(entries.values()).anySatisfy(bytes -> assertThat(bytes).isEqualTo(b));
        assertThat(entries.values()).anySatisfy(bytes -> assertThat(bytes).isEqualTo(twin));
        assertThat(loose.id()).isNotEqualTo(looseTwin.id());
    }

    @Test
    void exportingAnEmptyLibraryGivesAnEmptyZip() throws IOException {
        ResponseEntity<byte[]> response = http.getForEntity("/api/v1/library/export", byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(response.getBody()))) {
            assertThat(zip.getNextEntry()).isNull();
        }
    }

    @Test
    void aSavedNormaCanBeReadByItsId() throws IOException {
        CategoryNode fiscal = createCategory("Fiscal", null).getBody();
        SavedNrmSummary saved = save("A", "a.xlsx");
        assignCategory(saved.id(), fiscal.id());

        SavedNrmSummary read = http.getForObject("/api/v1/library/" + saved.id(), SavedNrmSummary.class);

        assertThat(read.name()).isEqualTo("A");
        assertThat(read.categoryId()).isEqualTo(fiscal.id());
        assertThat(http.getForEntity("/api/v1/library/" + UUID.randomUUID(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    private LibraryListing listing(String query) {
        return http.getForObject(URI.create(http.getRootUri() + "/api/v1/library" + (query.isEmpty() ? "" : "?" + query)), LibraryListing.class);
    }

    private ResponseEntity<CategoryNode> createCategory(String name, UUID parentId) {
        return http.postForEntity("/api/v1/categories", new CategoryRequest(name, parentId), CategoryNode.class);
    }

    private ResponseEntity<CategoryNode> putCategory(UUID id, String name, UUID parentId) {
        return http.exchange("/api/v1/categories/" + id, HttpMethod.PUT,
                new HttpEntity<>(new CategoryRequest(name, parentId)), CategoryNode.class);
    }

    private HttpStatus deleteCategory(UUID id) {
        return HttpStatus.valueOf(http.exchange("/api/v1/categories/" + id, HttpMethod.DELETE, null, Void.class)
                .getStatusCode().value());
    }

    private ResponseEntity<SavedNrmSummary> assignCategory(UUID id, UUID categoryId) {
        return http.exchange("/api/v1/library/" + id + "/category", HttpMethod.PUT,
                new HttpEntity<>(new NrmLibraryController.AssignCategoryRequest(categoryId)), SavedNrmSummary.class);
    }

    private List<String> names(String query) {
        // A URI, not a string: a string is run through URI templating, which would encode the "%" of "%25" a second time.
        URI uri = URI.create(http.getRootUri() + "/api/v1/library" + (query.isEmpty() ? "" : "?" + query));
        SavedNrmSummary[] listed = http.getForObject(uri, LibraryListing.class).normas().toArray(new SavedNrmSummary[0]);
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
