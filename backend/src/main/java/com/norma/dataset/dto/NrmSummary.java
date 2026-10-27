package com.norma.dataset.dto;

import java.time.Instant;

/**
 * What a .nrm file says about itself, read once when it is saved to the library: its name and creation
 * date from {@code info.json}, its dataset's file name, and how many operations, designated inputs and
 * designated outputs its model has.
 */
public record NrmSummary(
        String name, Instant createdAt, String datasetFilename, int operationCount, int inputCount, int outputCount) {
}
