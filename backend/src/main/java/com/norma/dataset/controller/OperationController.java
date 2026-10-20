package com.norma.dataset.controller;

import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.OperationType;
import com.norma.dataset.dto.SelectorRequest;
import com.norma.dataset.dto.SelectorResponse;
import com.norma.dataset.dto.TranslatorRequest;
import com.norma.dataset.dto.TranslatorResponse;
import com.norma.dataset.service.DatasetOperationService;
import com.norma.dataset.service.OperationTypes;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Operations", description = "Operations that need no dataset")
public class OperationController {

    private final DatasetOperationService datasetOperationService;

    public OperationController(DatasetOperationService datasetOperationService) {
        this.datasetOperationService = datasetOperationService;
    }

    @Operation(
            summary = "List available operation types",
            description = "The available operation types (id and label). Each id has a /api/v1/dataset/operation/{id} endpoint."
    )
    @GetMapping("/api/v1/dataset/operations")
    public ResponseEntity<List<OperationType>> listOperationTypes() {
        return ResponseEntity.ok(OperationTypes.ALL);
    }

    @Operation(
            summary = "Add up a list of values",
            description = "Adds up the given values. No dataset needed."
    )
    @PostMapping("/api/v1/dataset/operation/counter")
    public ResponseEntity<CounterResponse> counter(@RequestBody CounterRequest request) {
        return ResponseEntity.ok(datasetOperationService.counter(request));
    }

    @Operation(
            summary = "Pass a value through",
            description = "Returns the value it is given, so it can be referenced by other operations. No dataset needed."
    )
    @PostMapping("/api/v1/dataset/operation/node")
    public ResponseEntity<NodeResponse> node(@RequestBody NodeRequest request) {
        return ResponseEntity.ok(datasetOperationService.node(request));
    }

    @Operation(
            summary = "Translate a value",
            description = "Returns the target of the rule whose source matches the value; no match is an error. No dataset needed."
    )
    @PostMapping("/api/v1/dataset/operation/translator")
    public ResponseEntity<TranslatorResponse> translator(@RequestBody TranslatorRequest request) {
        return ResponseEntity.ok(datasetOperationService.translator(request));
    }

    @Operation(
            summary = "Select one of several values",
            description = "Returns the value at the given zero-based index; an index outside the values is an error. No dataset needed."
    )
    @PostMapping("/api/v1/dataset/operation/selector")
    public ResponseEntity<SelectorResponse> selector(@RequestBody SelectorRequest request) {
        return ResponseEntity.ok(datasetOperationService.selector(request));
    }
}
