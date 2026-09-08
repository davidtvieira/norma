package com.norma.dataset.controller;

import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.service.DatasetParserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
    @ApiResponse(responseCode = "200", description = "Dataset parsed successfully",
            content = @Content(schema = @Schema(implementation = DatasetImportResponse.class)))
    @ApiResponse(responseCode = "422", description = "File could not be parsed")
    @PostMapping(value = "/api/v1/dataset/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DatasetImportResponse> importDataset(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("O ficheiro enviado não pode estar vazio.");
        }
        return ResponseEntity.ok(datasetParserService.parse(file));
    }
}
