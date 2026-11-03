package com.norma.dataset.legacy;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** TEMPORARY: the endpoint behind the "Converter normas" button on the explore page. */
@RestController
public class LegacyConversionController {

    private final LegacyConversionService service;

    public LegacyConversionController(LegacyConversionService service) {
        this.service = service;
    }

    @Operation(
            summary = "Convert one saved norma to the current model shape",
            description = "Converts it in memory, runs every saved test case on the result and keeps it only when each run "
                    + "gives exactly what the norma gave before. With dryRun nothing is saved."
    )
    @PostMapping("/api/v1/library/{id}/convert")
    public ResponseEntity<ConversionReport> convert(@PathVariable UUID id, @RequestParam(defaultValue = "false") boolean dryRun) {
        return ResponseEntity.ok(service.convert(id, dryRun));
    }
}
