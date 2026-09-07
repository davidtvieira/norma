package com.norma.dataset.exception;

/**
 * Thrown when an uploaded file cannot be parsed into the dataset JSON contract.
 */
public class DatasetParsingException extends RuntimeException {

    public DatasetParsingException(String message, Throwable cause) {
        super(message, cause);
    }
}
