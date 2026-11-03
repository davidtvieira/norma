package com.norma.dataset.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.norma.dataset.exception.ModelDatasetMismatchException;

import java.util.List;

/**
 * Checks that a model can actually use a dataset: every sheet an operation points at (its
 * {@code sheetIndex}, a lookup's {@code searchSheetIndex}, an iterator's {@code startSheet}..
 * {@code endSheet}) has to exist in the dataset. Done when a model and dataset are first paired, so a
 * mismatch is rejected up front instead of surfacing as an error on the editor or utilize screens.
 */
final class ModelDatasetValidator {

    private static final List<String> SHEET_FIELDS = List.of("sheetIndex", "searchSheetIndex", "startSheet", "endSheet");

    private ModelDatasetValidator() {
    }

    /** @param model the model JSON (its {@code operations} tree) */
    static void assertFits(JsonNode model, int sheetCount) {
        for (JsonNode operation : model.path("operations")) {
            assertOperationFits(operation, sheetCount);
        }
        // The iteration of the settings has a range of pages, like the iterator it stands for.
        JsonNode iteration = model.path("settings").path("iteration");
        if (iteration.isObject()) {
            assertOperationFits(iteration, sheetCount);
        }
    }

    /**
     * Checks that a model can live without a dataset: none of its operations (at any depth) may be a kind that reads
     * from one. Done when a model with no dataset is registered or imported.
     */
    static void assertNoDatasetNeeded(JsonNode model) {
        for (JsonNode operation : model.path("operations")) {
            assertDatasetFree(operation);
        }
        // The page selector of the settings reads the dataset's pages like the operation it stands for.
        JsonNode page = model.path("settings").path("page");
        if (page.isObject()) {
            throw new ModelDatasetMismatchException("The page selector \"" + page.path("name").asText()
                    + "\" needs a dataset, but the model has none.");
        }
        JsonNode iteration = model.path("settings").path("iteration");
        if (iteration.isObject()) {
            throw new ModelDatasetMismatchException("The iteration \"" + iteration.path("name").asText()
                    + "\" needs a dataset, but the model has none.");
        }
    }

    private static void assertDatasetFree(JsonNode operation) {
        String kind = operation.path("kind").asText();
        if (OperationTypes.requiresDataset(kind)) {
            throw new ModelDatasetMismatchException("Operation \"" + operation.path("name").asText()
                    + "\" is a " + kind + " operation, which needs a dataset, but the model has none.");
        }
        for (JsonNode child : operation.path("operations")) {
            assertDatasetFree(child);
        }
    }

    private static void assertOperationFits(JsonNode operation, int sheetCount) {
        JsonNode fields = operation.path("fields");
        for (String field : SHEET_FIELDS) {
            JsonNode value = fields.path(field);
            if (value.isNumber() && (value.asInt() < 0 || value.asInt() >= sheetCount)) {
                throw new ModelDatasetMismatchException("Operation \"" + operation.path("name").asText()
                        + "\" uses sheet " + value.asInt() + " (" + field + "), but the dataset has " + sheetCount + " sheets.");
            }
        }
        for (JsonNode child : operation.path("operations")) {
            assertOperationFits(child, sheetCount);
        }
    }
}
