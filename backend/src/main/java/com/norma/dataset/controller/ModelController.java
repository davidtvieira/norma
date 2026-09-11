package com.norma.dataset.controller;

import com.norma.dataset.dto.ModelOperationResult;
import com.norma.dataset.dto.ModelRegisterRequest;
import com.norma.dataset.dto.ModelRegisterResponse;
import com.norma.dataset.dto.ModelRunRequest;
import com.norma.dataset.service.ModelExecutionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Models", description = "Registering, running and deleting a model (a saved chain of operations) as "
        + "a whole, as opposed to DatasetOperationController's single-operation endpoints used while a model is "
        + "still being built")
public class ModelController {

    private final ModelExecutionService modelExecutionService;

    public ModelController(ModelExecutionService modelExecutionService) {
        this.modelExecutionService = modelExecutionService;
    }

    @Operation(
            summary = "Register a model",
            description = "Registers a model (every operation's kind and fields, plus which ones are its "
                    + "designated inputs and which ones are its designated outputs — at least one output is "
                    + "required) against a previously imported dataset, returning an id to run it by. Meant for "
                    + "utilizing an already-built model (ModelCard), not for the editing page, which keeps "
                    + "calling the individual operation endpoints (see DatasetOperationController) as the model "
                    + "is being built. Registering once and running by id (see below) keeps a model's internals "
                    + "— every table/column/range detail — out of the repeated requests a caller makes while "
                    + "using it."
    )
    @PostMapping("/api/v1/dataset/{datasetId}/model")
    public ResponseEntity<ModelRegisterResponse> registerModel(
            @PathVariable String datasetId, @RequestBody ModelRegisterRequest request) {
        String modelId = modelExecutionService.registerModel(datasetId, request);
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
        return ResponseEntity.ok(modelExecutionService.runModel(datasetId, modelId, request.inputValues()));
    }

    @Operation(
            summary = "Delete a registered model",
            description = "Forgets a previously registered model — it can no longer be run by id afterwards. "
                    + "Does not affect the dataset it was registered against, nor the model's own exported JSON "
                    + "file (see frontend/src/utils/modelSerialization.ts), which remains importable/re-registerable "
                    + "independently of this in-memory registration."
    )
    @DeleteMapping("/api/v1/dataset/{datasetId}/model/{modelId}")
    public ResponseEntity<Void> deleteModel(@PathVariable String datasetId, @PathVariable String modelId) {
        modelExecutionService.deleteModel(datasetId, modelId);
        return ResponseEntity.noContent().build();
    }
}
