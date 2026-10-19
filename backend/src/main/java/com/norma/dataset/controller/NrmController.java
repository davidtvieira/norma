package com.norma.dataset.controller;

import com.norma.dataset.dto.NrmImportResponse;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
                    + "and, if valid, parses and stores its dataset like a plain dataset import.",
            requestBody = @RequestBody(required = true, content = @Content(mediaType = MediaType.MULTIPART_FORM_DATA_VALUE))
    )
    @ApiResponse(responseCode = "200", description = ".nrm valid; dataset stored",
            content = @Content(schema = @Schema(implementation = NrmImportResponse.class)))
    @ApiResponse(responseCode = "422", description = "Content is not a valid .nrm file")
    @PostMapping(value = "/api/v1/nrm/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<NrmImportResponse> importNrm(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(nrmService.importNrm(file));
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
