package com.norma.dataset.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.ModelInputsResponse;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRunRequest;
import com.norma.dataset.dto.ModelRunResponse;
import com.norma.dataset.dto.NrmImportStatus;
import com.norma.dataset.dto.NrmInfo;
import com.norma.dataset.service.NrmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@Tag(name = "NRM", description = "Validation and import of .nrm model files")
public class NrmController {

    private final NrmService nrmService;

    public NrmController(NrmService nrmService) {
        this.nrmService = nrmService;
    }

    @Operation(
            summary = "Import a .nrm file",
            description = "Validates the content of a .nrm file (dataset spreadsheet, model JSON and info.json) "
                    + "and, if valid, stores all of it: the dataset like a plain dataset import, the model like a "
                    + "model registration, and the .nrm itself, whose id every later request about it uses.",
            requestBody = @RequestBody(required = true, content = @Content(mediaType = MediaType.MULTIPART_FORM_DATA_VALUE))
    )
    @ApiResponse(responseCode = "200", description = ".nrm valid; dataset stored",
            content = @Content(schema = @Schema(implementation = NrmImportStatus.class)))
    @ApiResponse(responseCode = "422", description = "Content is not a valid .nrm file")
    @PostMapping(value = "/api/v1/nrm/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<NrmImportStatus> importNrm(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(nrmService.importNrm(file));
    }

    @Operation(
            summary = "Get an imported .nrm's inputs",
            description = "Returns only what someone utilizing the .nrm's model needs before running it: just the "
                    + "inputs to fill in. Never its operations or outputs (those come back with a run)."
    )
    @GetMapping("/api/v1/nrm/{nrmId}/inputs")
    public ResponseEntity<ModelInputsResponse> getInputs(@PathVariable String nrmId) {
        return ResponseEntity.ok(nrmService.getInputs(nrmId));
    }

    @Operation(
            summary = "Get one operation of an imported .nrm's model",
            description = "Read-only: an operation's id, name, kind and configuration, as the .nrm's model holds it."
    )
    @GetMapping("/api/v1/nrm/{nrmId}/operations/{operationId}")
    public ResponseEntity<com.norma.dataset.dto.ModelOperationInput> getOperation(
            @PathVariable String nrmId, @PathVariable String operationId) {
        return ResponseEntity.ok(nrmService.getOperation(nrmId, operationId));
    }

    @Operation(
            summary = "Run an imported .nrm's model",
            description = "Runs the model of a previously imported .nrm against its own dataset, with the given "
                    + "values for its inputs (keyed by input id), returning one named result per output."
    )
    @PostMapping("/api/v1/nrm/{nrmId}/run")
    public ResponseEntity<ModelRunResponse> run(
            @PathVariable String nrmId, @org.springframework.web.bind.annotation.RequestBody ModelRunRequest request) {
        return ResponseEntity.ok(nrmService.runWatching(nrmId, request.inputValues(), request.watchIds()));
    }

    @Operation(
            summary = "Get an imported .nrm's model",
            description = "Returns the model JSON of a previously imported .nrm exactly as the file held it (the "
                    + "operation tree with names, fields and canvas positions, plus the .nrm's name). Only meant for "
                    + "editing the model: using it needs just the inputs and a run, never this."
    )
    @GetMapping("/api/v1/nrm/{nrmId}/model")
    public ResponseEntity<JsonNode> getModel(@PathVariable String nrmId) {
        return ResponseEntity.ok(nrmService.getModel(nrmId));
    }

    @Operation(
            summary = "Get an imported .nrm's dataset",
            description = "Returns the dataset (filename and every sheet) stored from the .nrm's spreadsheet."
    )
    @GetMapping("/api/v1/nrm/{nrmId}/dataset")
    public ResponseEntity<DatasetImportResponse> getDataset(@PathVariable String nrmId) {
        return ResponseEntity.ok(nrmService.getDataset(nrmId));
    }

    @Operation(
            summary = "Validate a .nrm file",
            description = "Same content validation as the import, but stores nothing.",
            requestBody = @RequestBody(required = true, content = @Content(mediaType = MediaType.MULTIPART_FORM_DATA_VALUE))
    )
    @ApiResponse(responseCode = "200", description = ".nrm valid",
            content = @Content(schema = @Schema(implementation = NrmInfo.class)))
    @ApiResponse(responseCode = "422", description = "Content is not a valid .nrm file")
    @PostMapping(value = "/api/v1/nrm/validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<NrmInfo> validateNrm(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(nrmService.validate(file));
    }
}
