package com.norma.dataset.library;

/** A category change refused because a sibling already has that name. */
public class CategoryConflictException extends RuntimeException {

    public CategoryConflictException(String message) {
        super(message);
    }
}
