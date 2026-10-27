package com.norma.dataset.library;

/** A saved .nrm that is not in the library, or whose file is gone from the storage folder. */
public class SavedNrmNotFoundException extends RuntimeException {

    public SavedNrmNotFoundException(String message) {
        super(message);
    }
}
