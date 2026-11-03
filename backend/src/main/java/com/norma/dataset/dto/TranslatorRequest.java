package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for the translator operation: the value to translate (already resolved client-side, a
 * typed literal or chained from another operation's own live result — same as every other kind's
 * chainable "input") and its mapping table. {@code type} is {@code "fixed"} (each rule maps one exact source value) or
 * {@code "range"} (each rule maps a numeric interval); absent means fixed. No dataset dependency, same as calc/node:
 * the rules are entirely user-defined, not read from any table.
 */
public record TranslatorRequest(String input, String type, List<TranslatorRule> rules) {

    /** A fixed translator. */
    public TranslatorRequest(String input, List<TranslatorRule> rules) {
        this(input, null, rules);
    }
}
