package com.norma.dataset.dto;

/**
 * One designated input of a registered model, as seen by whoever utilizes it: just enough to
 * render it — never the operation's table/column/range configuration. {@code value} is the
 * literal it was registered with (its starting text).
 */
public record ModelInputField(String id, String name, String kind, String value) {
}
