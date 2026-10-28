package com.norma.dataset.library;

/** A category that is not in the library. */
public class CategoryNotFoundException extends RuntimeException {

    public CategoryNotFoundException(String message) {
        super(message);
    }
}
