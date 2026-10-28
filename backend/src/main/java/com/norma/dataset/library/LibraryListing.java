package com.norma.dataset.library;

import java.util.List;

/**
 * What GET /api/v1/library answers: the categories it found and the saved .nrm files it found, for one level of the
 * library (the top, or one category) or, when searching everywhere, for all of it. {@code path} is where that is: the
 * categories from the top-level one down to the one being looked into, itself last (empty at the top, and when
 * searching everywhere). {@code total} is how many .nrm files the place being looked into holds — the open category and the
 * ones inside it, or the whole library when no category was asked for — whatever the search, level or
 * {@code everywhere} say.
 */
public record LibraryListing(List<PathStep> path, List<FolderEntry> categories, List<SavedNrmSummary> normas, long total) {
}
