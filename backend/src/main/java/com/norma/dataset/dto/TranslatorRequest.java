package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for the translator operation: the value to translate (already resolved client-side, a
 * typed literal or chained from another operation's own live result — same as every other kind's
 * chainable "input") and its mapping table. No dataset dependency, same as counter/node: the rules
 * are entirely user-defined, not read from any table.
 */
public record TranslatorRequest(String input, List<TranslatorRule> rules) {
}
