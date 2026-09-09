package com.norma.dataset.controller;

import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.ModelRegisterResponse;
import com.norma.dataset.dto.ModelRunRequest;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
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
            new OperationType("sum", "Sum"),
            new OperationType("counter", "Counter"),
            new OperationType("node", "Node")
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
            summary = "Add up a list of values",
            description = "Adds together however many already-resolved values it's given. Unlike lookup/sum, "
                    + "a counter has no dataset dependency of its own — each value was already resolved "
                    + "client-side (typed directly, or chained from another operation's own live result) "
                    + "before this is called, so no datasetId/table/column/range is sent here, only the values."
    )
    @PostMapping("/api/v1/dataset/operation/counter")
    public ResponseEntity<CounterResponse> counter(@RequestBody CounterRequest request) {
        return ResponseEntity.ok(datasetOperationService.counter(request));
    }

    @Operation(
            summary = "Pass a value through",
            description = "Returns the same value it's given. A node isn't really a computation — it exists so "
                    + "an already-resolved value (typed directly, or chained from another operation's own live "
                    + "result) can be referenced as another operation's chainable input, the same way any other "
                    + "operation's result can be. No dataset dependency, same as counter."
    )
    @PostMapping("/api/v1/dataset/operation/node")
    public ResponseEntity<NodeResponse> node(@RequestBody NodeRequest request) {
        return ResponseEntity.ok(datasetOperationService.node(request));
    }

    @Operation(
            summary = "Register a model",
            description = "Registers a model (every operation's kind and fields, plus which ones are its "
                    + "designated inputs and which ones are its designated outputs — at least one output is "
                    + "required) against a previously imported dataset, returning an id to run it by. Meant for "
                    + "utilizing an already-built model (ModelCard), not for the editing page, which keeps "
                    + "calling the individual operation endpoints below as the model is being built. Registering "
                    + "once and running by id (see below) keeps a model's internals — every table/column/range "
                    + "detail — out of the repeated requests a caller makes while using it."
    )
    @PostMapping("/api/v1/dataset/{datasetId}/model")
    public ResponseEntity<ModelRegisterResponse> registerModel(
            @PathVariable String datasetId, @RequestBody ModelRegisterRequest request) {
        String modelId = datasetOperationService.registerModel(datasetId, request);
        return ResponseEntity.ok(new ModelRegisterResponse(modelId));
    }

    @Operation(
            summary = "Run a registered model",
            description = "Runs a previously registered model — resolving chained (reference) inputs between "
                    + "its operations server-side, the same way as a single-operation call — and returns one "
                    + "result per designated output (always at least one), not every operation's. The request "
                    + "body's inputValues (keyed by operation id) replaces each of the model's designated input "
                    + "operations' literal value for this run (ignored if the model has none; a missing entry "
                    + "for one of them is treated as an empty string for that one)."
    )
    @PostMapping("/api/v1/dataset/{datasetId}/model/{modelId}/run")
    public ResponseEntity<List<ModelOperationResult>> runModel(
            @PathVariable String datasetId, @PathVariable String modelId, @RequestBody ModelRunRequest request) {
        return ResponseEntity.ok(datasetOperationService.runModel(datasetId, modelId, request.inputValues()));
    }
}
