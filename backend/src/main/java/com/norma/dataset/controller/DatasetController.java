package com.norma.dataset.controller;

import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.DatasetImportStatus;
import com.norma.dataset.service.DatasetParserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Tag(name = "Dataset", description = "Dataset ingestion and JSON conversion API")
public class DatasetController {

    private final DatasetParserService datasetParserService;

    public DatasetController(DatasetParserService datasetParserService) {
        this.datasetParserService = datasetParserService;
    }

    @Operation(
            summary = "Import a dataset file",
            description = "Uploads a spreadsheet file (.xlsx or .xls) and converts it into index-addressed sheet/row/cell JSON.",
            requestBody = @RequestBody(
                    required = true,
                    content = @Content(mediaType = MediaType.MULTIPART_FORM_DATA_VALUE)
            )
    )
    @ApiResponse(responseCode = "200", description = "Dataset parsed and stored",
            content = @Content(schema = @Schema(implementation = DatasetImportStatus.class)))
    @ApiResponse(responseCode = "422", description = "File could not be parsed")
    @PostMapping(value = "/api/v1/dataset/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DatasetImportStatus> importDataset(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("The uploaded file cannot be empty.");
        }
        return ResponseEntity.ok(DatasetImportStatus.success(datasetParserService.parse(file).datasetId()));
    }

    @Operation(
            summary = "Check an imported dataset",
            description = "Returns the same status and id as the import endpoint if a dataset with the given id "
                    + "is still stored, without sending its sheets."
    )
    @ApiResponse(responseCode = "200", description = "Dataset found",
            content = @Content(schema = @Schema(implementation = DatasetImportStatus.class)))
    @ApiResponse(responseCode = "400", description = "No dataset exists with the given id")
    @GetMapping("/api/v1/dataset/{datasetId}/status")
    public ResponseEntity<DatasetImportStatus> getDatasetStatus(@PathVariable String datasetId) {
        return ResponseEntity.ok(DatasetImportStatus.success(datasetParserService.get(datasetId).datasetId()));
    }

    @Operation(
            summary = "Get an imported dataset",
            description = "Returns a previously imported dataset (filename and every sheet's rows) by the id the import "
                    + "endpoint returned."
    )
    @ApiResponse(responseCode = "200", description = "Dataset found",
            content = @Content(schema = @Schema(implementation = DatasetImportResponse.class)))
    @ApiResponse(responseCode = "400", description = "No dataset exists with the given id")
    @GetMapping("/api/v1/dataset/{datasetId}")
    public ResponseEntity<DatasetImportResponse> getDataset(@PathVariable String datasetId) {
        return ResponseEntity.ok(datasetParserService.get(datasetId));
    }

    @Operation(
            summary = "Delete an imported dataset",
            description = "Forgets a previously imported dataset — it can no longer be referenced by id "
                    + "afterwards, by any operation, single or model-run. Any model still registered against it "
                    + "is left in place but can no longer be run, since a run re-fetches the dataset by id."
    )
    @ApiResponse(responseCode = "204", description = "Dataset deleted")
    @ApiResponse(responseCode = "400", description = "No dataset exists with the given id")
    @DeleteMapping("/api/v1/dataset/{datasetId}")
    public ResponseEntity<Void> deleteDataset(@PathVariable String datasetId) {
        datasetParserService.delete(datasetId);
        return ResponseEntity.noContent().build();
    }
}
