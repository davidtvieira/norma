package com.norma.dataset.dto;

/**
 * Result of a translator operation: the target value of the rule whose source matched the given
 * input. There's no "not found" case to represent here — an input with no matching rule is a
 * request error (see DatasetOperationService.translator), not a quiet null, so a response only
 * ever carries a successful translation.
 */
public record TranslatorResponse(String value) {
}
