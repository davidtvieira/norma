package com.norma.dataset.dto;

/**
 * Input for the node operation: the single already-resolved value it stands for (a typed literal,
 * or — from the editor's perspective — chained from another operation's own live result). A node
 * has no dataset dependency and does no computation of its own; it exists purely so that value can
 * be referenced as another operation's chainable input, the same way any other operation's result
 * can.
 */
public record NodeRequest(String value) {
}
