package com.norma.dataset.library;

import java.util.UUID;

/** One step of the path GET /api/v1/library is looking into: a category and the id to go back to it. */
public record PathStep(UUID id, String name) {
}
