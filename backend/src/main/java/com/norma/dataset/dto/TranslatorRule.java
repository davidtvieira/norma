package com.norma.dataset.dto;

/**
 * One entry of a translator operation's mapping table: a source value and the target value it
 * translates to. Several rules can share the same target (many source values mapping to one
 * translation is fine — that's the whole point), but no two rules may share the same source, since
 * that would leave the translation for that value ambiguous — enforced where rules are read
 * (see DatasetOperationService).
 */
public record TranslatorRule(String from, String to) {
}
