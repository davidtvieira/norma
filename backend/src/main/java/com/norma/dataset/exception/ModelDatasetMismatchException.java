package com.norma.dataset.exception;

/**
 * A model that is well-formed but cannot be used with the dataset it was paired with — it points
 * at a sheet the dataset does not have.
 */
public class ModelDatasetMismatchException extends RuntimeException {

    public ModelDatasetMismatchException(String message) {
        super(message);
    }
}
