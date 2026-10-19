package com.norma.dataset.controller;

import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import com.norma.dataset.service.DatasetOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Dataset operations", description = "Operations that read an imported dataset")
public class DatasetOperationController {

    private final DatasetOperationService datasetOperationService;

    public DatasetOperationController(DatasetOperationService datasetOperationService) {
        this.datasetOperationService = datasetOperationService;
    }

    @Operation(
            summary = "Look up a value",
            description = "Finds the row in the search table matching the query and returns a column value "
                    + "from the corresponding row (by row index) in the result table."
    )
    @PostMapping("/api/v1/dataset/operation/lookup")
    public ResponseEntity<LookupResponse> lookup(@RequestBody LookupRequest request) {
        return ResponseEntity.ok(datasetOperationService.lookup(request));
    }

    @Operation(
            summary = "Sum a range",
            description = "Sums the numeric values of every cell within the given rectangular range (row/column "
                    + "bounds, all inclusive). Non-numeric and blank cells are skipped."
    )
    @PostMapping("/api/v1/dataset/operation/sum")
    public ResponseEntity<SumResponse> sum(@RequestBody SumRequest request) {
        return ResponseEntity.ok(datasetOperationService.sum(request));
    }

    @Operation(
            summary = "Find a value's position",
            description = "Searches every cell within the given rectangular range (row/column bounds, all "
                    + "inclusive), row by row then column by column within each row, for the first one matching "
                    + "the query, and returns its position. Unlike lookup, which reads a value from a different "
                    + "column of the matched row, find reports the position of the match itself — the row and "
                    + "column index — not a value read from elsewhere."
    )
    @PostMapping("/api/v1/dataset/operation/find")
    public ResponseEntity<FindResponse> find(@RequestBody FindRequest request) {
        return ResponseEntity.ok(datasetOperationService.find(request));
    }
}
