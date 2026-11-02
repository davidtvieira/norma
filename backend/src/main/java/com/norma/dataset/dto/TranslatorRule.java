package com.norma.dataset.dto;

/**
 * One entry of a translator operation's mapping table. A fixed translator's rule is a source value ({@code from}) and
 * the target ({@code to}) it translates to: several rules can share the same target (many source values mapping to one
 * translation is fine — that's the whole point), but no two rules may share the same source, since that would leave
 * the translation for that value ambiguous. A range translator's rule is a numeric interval, {@code min} to {@code max}
 * (both inclusive, either may be left out for "no lower / upper limit"), and the target for any value inside it; two
 * intervals may not overlap. Both are enforced where rules are read (see OperationSupport).
 */
public record TranslatorRule(String from, String to, String min, String max) {

    /** A fixed rule: no interval. */
    public TranslatorRule(String from, String to) {
        this(from, to, null, null);
    }
}
