package com.norma.dataset.controller;

import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.OperationType;
import com.norma.dataset.service.DatasetOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Dataset operations", description = "Data operations executed against an already-imported dataset")
public class DatasetOperationController {

    private static final List<OperationType> OPERATION_TYPES = List.of(new OperationType("lookup", "Lookup"));

    private final DatasetOperationService datasetOperationService;

    public DatasetOperationController(DatasetOperationService datasetOperationService) {
        this.datasetOperationService = datasetOperationService;
    }

    @Operation(
            summary = "List available operation types",
            description = "The kinds of condition the frontend can build (id and display label). Each id maps to "
                    + "one /api/v1/dataset/operation/{id} endpoint."
    )
    @GetMapping("/api/v1/dataset/operations")
    public ResponseEntity<List<OperationType>> listOperationTypes() {
        return ResponseEntity.ok(OPERATION_TYPES);
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
}
