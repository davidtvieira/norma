package com.norma.dataset.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.norma.dataset.dto.NrmInfo;

/**
 * An imported .nrm file, kept in memory (see NrmStore): the dataset stored from its spreadsheet,
 * the model registered from its model JSON ({@code modelId}, null when the model has no usable
 * output and so couldn't be registered), the model JSON itself exactly as the file held it (only
 * served on request, for editing) and the .nrm's own {@link NrmInfo}. Everything a caller does with
 * the .nrm afterwards (read its inputs, run it, read its dataset or model) goes through its id alone.
 */
record StoredNrm(String datasetId, String modelId, NrmInfo info, JsonNode model) {
}
