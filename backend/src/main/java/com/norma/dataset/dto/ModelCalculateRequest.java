package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for calculating a whole model in one call: every operation's kind and fields — the
 * dataset id itself comes from the URL path, not the body.
 */
public record ModelCalculateRequest(List<ModelOperationInput> operations) {
}
