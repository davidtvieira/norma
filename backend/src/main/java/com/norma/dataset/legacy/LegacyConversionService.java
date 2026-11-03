package com.norma.dataset.legacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.norma.dataset.dto.ModelRunResponse;
import com.norma.dataset.library.NrmLibraryService;
import com.norma.dataset.service.NrmService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TEMPORARY: converts one saved norma to the current model shape, and only keeps the result when it proves itself. The
 * norma is converted in memory, run on every saved test case (see {@link BaselineStore}), and each run must give exactly
 * what the norma gave before: the same value and highlighted cells for every operation, and a failure where it failed (what
 * the error says may be worded differently). Anything else leaves the saved norma untouched and says what differed.
 */
@Service
public class LegacyConversionService {

    private static final int MAX_PROBLEMS = 6;

    private final NrmLibraryService library;
    private final NrmService nrmService;
    private final BaselineStore baselines;
    private final ObjectMapper mapper = new ObjectMapper();

    public LegacyConversionService(NrmLibraryService library, NrmService nrmService, BaselineStore baselines) {
        this.library = library;
        this.nrmService = nrmService;
        this.baselines = baselines;
    }

    public ConversionReport convert(UUID id, boolean dryRun) {
        String name = library.get(id).name();
        try {
            NrmLibraryService.StoredFile stored = library.file(id);
            LegacyModelConverter.Changes[] changes = new LegacyModelConverter.Changes[1];
            byte[] converted = nrmService.rewriteModel(stored.bytes(), model -> {
                LegacyModelConverter.Result result = LegacyModelConverter.convert(model);
                changes[0] = result.changes();
                return result.model();
            });
            if (!changes[0].any()) {
                return report(id, name, "unchanged", changes[0], 0, List.of());
            }

            JsonNode baseline = baselines.load(id).orElse(null);
            if (baseline == null) {
                return report(id, name, "failed", changes[0], 0,
                        List.of("There is no saved baseline for this norma, so its conversion cannot be checked."));
            }

            List<String> problems = new ArrayList<>();
            int cases = verify(converted, baseline, problems);
            if (!problems.isEmpty()) {
                return report(id, name, "failed", changes[0], cases, problems);
            }
            if (!dryRun) {
                library.replace(id, converted);
            }
            return report(id, name, dryRun ? "verified" : "converted", changes[0], cases, List.of());
        } catch (RuntimeException e) {
            return new ConversionReport(id.toString(), name, "failed", 0, 0, 0, 0, 0, 0,
                    List.of(String.valueOf(e.getMessage())));
        }
    }

    /** Runs every baseline case on the converted file; returns how many there were and fills {@code problems}. */
    private int verify(byte[] converted, JsonNode baseline, List<String> problems) {
        String nrmId = nrmService.open("converted.nrm", converted, Instant.now(), Instant.now()).nrmId();
        List<String> watchIds = new ArrayList<>();
        for (JsonNode operation : baseline.path("operations")) {
            watchIds.add(operation.path("id").asText());
        }
        int cases = 0;
        for (JsonNode testCase : baseline.path("cases")) {
            cases++;
            Map<String, String> inputs = new HashMap<>();
            testCase.path("inputValues").fields().forEachRemaining(entry -> inputs.put(entry.getKey(), entry.getValue().asText()));
            JsonNode now;
            try {
                ModelRunResponse response = nrmService.runWatching(nrmId, inputs, watchIds);
                // Through text, so numbers are read back the way the saved ones were (an int stays an int).
                now = mapper.readTree(mapper.writeValueAsString(response));
            } catch (Exception e) {
                problems.add("case " + testCase.path("case").asText() + ": the run failed: " + e.getMessage());
                continue;
            }
            describeDifference(testCase.path("case").asText(), testCase.path("response"), now, problems);
            if (problems.size() >= MAX_PROBLEMS) {
                break;
            }
        }
        return cases;
    }

    private void describeDifference(String caseName, JsonNode before, JsonNode now, List<String> problems) {
        for (String group : List.of("results", "watched")) {
            Map<String, JsonNode> earlier = byId(before.path(group));
            for (JsonNode current : now.path(group)) {
                JsonNode was = earlier.get(current.path("id").asText());
                if (was == null || !sameOutcome(was, current)) {
                    problems.add("case " + caseName + ", " + group + " " + current.path("name").asText(current.path("id").asText())
                            + ": was " + brief(was) + ", now " + brief(current));
                    if (problems.size() >= MAX_PROBLEMS) {
                        return;
                    }
                }
            }
            if (earlier.size() != now.path(group).size()) {
                problems.add("case " + caseName + ", " + group + ": " + earlier.size() + " before, " + now.path(group).size() + " now");
            }
        }
    }

    /**
     * Two results of one operation are the same when they are identical — value, highlighted cells and all — or when both
     * are failures: the wording of an error is not a result, and the converted operation may say it more clearly.
     */
    private static boolean sameOutcome(JsonNode was, JsonNode now) {
        if (!was.path("success").asBoolean() && !now.path("success").asBoolean()) {
            return true;
        }
        return was.equals(now);
    }

    private static Map<String, JsonNode> byId(JsonNode results) {
        Map<String, JsonNode> byId = new HashMap<>();
        for (JsonNode result : results) {
            byId.put(result.path("id").asText(), result);
        }
        return byId;
    }

    private static String brief(JsonNode result) {
        if (result == null) {
            return "missing";
        }
        return result.path("success").asBoolean() ? "value " + result.path("value") : "error \"" + result.path("error").asText() + "\"";
    }

    private static ConversionReport report(
            UUID id, String name, String status, LegacyModelConverter.Changes changes, int cases, List<String> problems) {
        return new ConversionReport(id.toString(), name, status, changes.counters(), changes.calcs(), changes.formatters(), changes.pages(), changes.iterations(), cases, problems);
    }
}
