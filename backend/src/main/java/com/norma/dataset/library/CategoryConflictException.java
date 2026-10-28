package com.norma.dataset.library;

/** A category change refused because of what already exists: a sibling with the same name, or contents in the way. */
public class CategoryConflictException extends RuntimeException {

    public CategoryConflictException(String message) {
        super(message);
    }
}
