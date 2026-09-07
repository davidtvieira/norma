package com.norma.dataset.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.Instant;

/**
 * Translates dataset-related failures into consistent JSON error responses.
 */
@RestControllerAdvice
public class DatasetExceptionHandler {

    @ExceptionHandler(DatasetParsingException.class)
    public ResponseEntity<ApiErrorResponse> handleParsingException(DatasetParsingException ex) {
        return buildResponse(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        return buildResponse(HttpStatus.PAYLOAD_TOO_LARGE, "O ficheiro enviado excede o tamanho máximo permitido.");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    private ResponseEntity<ApiErrorResponse> buildResponse(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(Instant.now(), status.value(), message));
    }
}
