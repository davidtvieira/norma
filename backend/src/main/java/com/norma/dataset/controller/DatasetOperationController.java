package com.norma.dataset.controller;

import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.ModelCalculateRequest;
import com.norma.dataset.dto.ModelCalculateResponse;
import com.norma.dataset.dto.OperationType;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import com.norma.dataset.service.DatasetOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Dataset operations", description = "Data operations executed against an already-imported dataset")
public class DatasetOperationController {

    private static final List<OperationType> OPERATION_TYPES = List.of(
            new OperationType("lookup", "Lookup"),
            new OperationType("sum", "Sum")
    );

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
            summary = "Calculate a whole model",
            description = "Runs every operation of a model against a previously imported dataset in a single "
                    + "call, resolving chained (reference) inputs between operations server-side instead of the "
                    + "frontend calling one operation endpoint per entry. Meant for utilizing an already-built "
                    + "model, not for the editing page, which keeps calling the individual operation endpoints "
                    + "above as the model is being built. One operation failing doesn't stop the others in the "
                    + "same request from being computed."
    )
    @PostMapping("/api/v1/dataset/{datasetId}/model/calculate")
    public ResponseEntity<ModelCalculateResponse> calculateModel(
            @PathVariable String datasetId, @RequestBody ModelCalculateRequest request) {
        return ResponseEntity.ok(datasetOperationService.calculateModel(datasetId, request.operations()));
    }
}
