package com.norma.dataset.legacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Iterator;
import java.util.Map;

/**
 * TEMPORARY, together with everything in this package: rewrites a saved model into the shape the app now uses, once.
 * Each step is idempotent (an operation already in the new shape is left alone), so running it twice changes nothing.
 *
 * <ul>
 *   <li>a counter becomes a calc that adds: same inputs, in the same order;</li>
 *   <li>a calc made with "a" and "b" becomes a calc with the list "inputs" [a, b], keeping its operation and format.</li>
 * </ul>
 *
 * The model is a tree (an operation nests under the first operation it references), and every operation keeps its id
 * and its place in it, so references, inputs and outputs still point at the same operations.
 */
public final class LegacyModelConverter {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    /** What a conversion changed: how many counters became calcs, and how many two-value calcs became lists. */
    public record Changes(int counters, int calcs) {
        public boolean any() {
            return counters > 0 || calcs > 0;
        }
    }

    public record Result(JsonNode model, Changes changes) {
    }

    private int counters;
    private int calcs;

    private LegacyModelConverter() {
    }

    /** Converts a copy of {@code model}; the given tree is left as it is. */
    public static Result convert(JsonNode model) {
        JsonNode copy = model.deepCopy();
        LegacyModelConverter converter = new LegacyModelConverter();
        converter.walk(copy.path("operations"));
        return new Result(copy, new Changes(converter.counters, converter.calcs));
    }

    private void walk(JsonNode operations) {
        if (!operations.isArray()) {
            return;
        }
        for (JsonNode node : operations) {
            if (node instanceof ObjectNode operation) {
                convertOperation(operation);
                walk(operation.path("operations"));
            }
        }
    }

    private void convertOperation(ObjectNode operation) {
        String kind = operation.path("kind").asText();
        if (!(operation.get("fields") instanceof ObjectNode fields)) {
            return;
        }
        if ("counter".equals(kind)) {
            ObjectNode converted = NODES.objectNode();
            converted.set("inputs", fields.has("inputs") ? fields.get("inputs") : NODES.arrayNode());
            converted.put("operation", "add");
            converted.put("format", "none");
            copyOthers(fields, converted, "inputs");
            operation.put("kind", "calc");
            operation.set("fields", converted);
            counters++;
        } else if ("calc".equals(kind) && !fields.has("inputs") && fields.has("a") && fields.has("b")) {
            ArrayNode inputs = NODES.arrayNode();
            inputs.add(fields.get("a"));
            inputs.add(fields.get("b"));
            ObjectNode converted = NODES.objectNode();
            converted.set("inputs", inputs);
            converted.set("operation", fields.has("operation") ? fields.get("operation") : NODES.textNode("add"));
            converted.set("format", fields.has("format") ? fields.get("format") : NODES.textNode("none"));
            copyOthers(fields, converted, "a", "b", "operation", "format");
            operation.set("fields", converted);
            calcs++;
        }
    }

    private static void copyOthers(ObjectNode from, ObjectNode to, String... except) {
        Iterator<Map.Entry<String, JsonNode>> entries = from.fields();
        while (entries.hasNext()) {
            Map.Entry<String, JsonNode> entry = entries.next();
            boolean skip = false;
            for (String name : except) {
                skip |= name.equals(entry.getKey());
            }
            if (!skip) {
                to.set(entry.getKey(), entry.getValue());
            }
        }
    }
}
