package com.norma.dataset.exception;

import java.time.Instant;

/**
 * Standard error payload returned for failed dataset API requests.
 */
public record ApiErrorResponse(Instant timestamp, int status, String message) {
}
