package com.norma.dataset.library;

import java.util.UUID;

/** The body of a category create or update: its name and the category it goes under (null = top level). */
public record CategoryRequest(String name, UUID parentId) {
}
