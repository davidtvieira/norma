package com.norma.dataset.controller;

import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.OperationType;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import com.norma.dataset.dto.TranslatorRequest;
import com.norma.dataset.dto.TranslatorResponse;
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
@Tag(name = "Dataset operations", description = "Single-operation endpoints (lookup/sum/counter/node) executed "
        + "against an already-imported dataset while a model is being built in the editor — see ModelController "
        + "for registering/running a whole model at once")
public class DatasetOperationController {

    private static final List<OperationType> OPERATION_TYPES = List.of(
            new OperationType("lookup", "Lookup"),
            new OperationType("sum", "Sum"),
            new OperationType("counter", "Counter"),
            new OperationType("node", "Node"),
            new OperationType("find", "Find"),
            new OperationType("translator", "Translator")
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
            summary = "Translate a value",
            description = "Looks up the given value against a set of source-to-target rules and returns the "
                    + "matching rule's target. Each rule's source must be unique — two rules can't share one, "
                    + "since that would leave the translation ambiguous — and a value with no matching rule is a "
                    + "request error, not a quiet non-match. No dataset dependency, same as counter/node: the "
                    + "rules are entirely user-defined."
    )
    @PostMapping("/api/v1/dataset/operation/translator")
    public ResponseEntity<TranslatorResponse> translator(@RequestBody TranslatorRequest request) {
        return ResponseEntity.ok(datasetOperationService.translator(request));
    }
}
