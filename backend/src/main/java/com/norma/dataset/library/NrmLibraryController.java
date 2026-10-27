package com.norma.dataset.library;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/library")
@Tag(name = "Library", description = "The saved .nrm files: list, save, replace, open, download and delete.")
public class NrmLibraryController {

    private final NrmLibraryService library;

    public NrmLibraryController(NrmLibraryService library) {
        this.library = library;
    }

    @Operation(
            summary = "List the saved .nrm files",
            description = "Most recently saved first, unless told otherwise. search keeps the models whose name or "
                    + "dataset file name contains the text (any case). sort is one of name, updatedAt, createdAt, "
                    + "sizeBytes and operationCount; direction is asc or desc (by default A to Z for the name and "
                    + "newest or biggest first for the rest). An unknown sort or direction is a 400."
    )
    @GetMapping
    public List<SavedNrmSummary> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String direction) {
        return library.list(search, sort, direction);
    }

    @Operation(
            summary = "Save a .nrm file to the library",
            description = "Validates the file like an import does, then keeps it in the storage folder. "
                    + "Responds with the saved entry, whose id addresses it from then on."
    )
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SavedNrmSummary> save(@RequestParam("file") MultipartFile file) throws IOException {
        return ResponseEntity.status(HttpStatus.CREATED).body(library.save(file.getBytes()));
    }

    @Operation(summary = "Replace a saved .nrm file", description = "Keeps the id and the creation date.")
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SavedNrmSummary replace(@PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return library.replace(id, file.getBytes());
    }

    @Operation(summary = "Download a saved .nrm file")
    @GetMapping("/{id}/file")
    public ResponseEntity<byte[]> file(@PathVariable UUID id) {
        NrmLibraryService.StoredFile file = library.file(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.filename(), StandardCharsets.UTF_8).build().toString())
                .body(file.bytes());
    }

    @Operation(summary = "Delete a saved .nrm", description = "Removes its entry and its file.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        library.delete(id);
        return ResponseEntity.noContent().build();
    }
}
