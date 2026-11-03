package com.norma.dataset.legacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LegacyModelConverterTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode model(String json) throws Exception {
        return MAPPER.readTree(json);
    }

    private static final String OLD = """
            {"version":1,"modelName":"M","inputOperationIds":["n1","n2"],"outputOperationIds":["c","k"],
             "operations":[
              {"id":"n1","kind":"node","name":"A","fields":{"input":{"type":"literal","value":""}},"position":{"x":1,"y":2},"operations":[
                {"id":"c","kind":"calc","name":"Diferença","fields":{"a":{"type":"reference","operationId":"n1"},"b":{"type":"reference","operationId":"n2"},"operation":"subtract","format":"abs"},"position":{"x":3,"y":4},"operations":[]},
                {"id":"k","kind":"counter","name":"Total","fields":{"inputs":[{"type":"reference","operationId":"n1"},{"type":"reference","operationId":"n2"},{"type":"literal","value":"5"}]},"position":{"x":5,"y":6},"operations":[]}]},
              {"id":"n2","kind":"node","name":"B","fields":{"input":{"type":"literal","value":""}},"position":{"x":7,"y":8},"operations":[]}]}""";

    @Test
    void aCounterBecomesACalcThatAddsTheSameInputsInTheSameOrder() throws Exception {
        LegacyModelConverter.Result result = LegacyModelConverter.convert(model(OLD));

        JsonNode counter = result.model().path("operations").get(0).path("operations").get(1);
        assertThat(counter.path("kind").asText()).isEqualTo("calc");
        assertThat(counter.path("fields").path("operation").asText()).isEqualTo("add");
        assertThat(counter.path("fields").path("format").asText()).isEqualTo("none");
        assertThat(counter.path("fields").path("inputs")).isEqualTo(model(OLD).path("operations").get(0).path("operations").get(1).path("fields").path("inputs"));
        assertThat(counter.path("id").asText()).isEqualTo("k");
        assertThat(counter.path("name").asText()).isEqualTo("Total");
        assertThat(result.changes().counters()).isEqualTo(1);
    }

    @Test
    void aCalcWithAAndBBecomesAListOfTwoKeepingItsOperationAndFormat() throws Exception {
        LegacyModelConverter.Result result = LegacyModelConverter.convert(model(OLD));

        JsonNode calc = result.model().path("operations").get(0).path("operations").get(0);
        assertThat(calc.path("kind").asText()).isEqualTo("calc");
        assertThat(calc.path("fields").has("a")).isFalse();
        assertThat(calc.path("fields").has("b")).isFalse();
        assertThat(calc.path("fields").path("inputs")).hasSize(2);
        assertThat(calc.path("fields").path("inputs").get(0).path("operationId").asText()).isEqualTo("n1");
        assertThat(calc.path("fields").path("inputs").get(1).path("operationId").asText()).isEqualTo("n2");
        assertThat(calc.path("fields").path("operation").asText()).isEqualTo("subtract");
        assertThat(calc.path("fields").path("format").asText()).isEqualTo("abs");
        assertThat(result.changes().calcs()).isEqualTo(1);
    }

    @Test
    void everythingElseStaysExactlyAsItWasAndTheGivenModelIsNotTouched() throws Exception {
        JsonNode original = model(OLD);
        JsonNode result = LegacyModelConverter.convert(original).model();

        assertThat(original).isEqualTo(model(OLD));
        assertThat(result.path("operations").get(1)).isEqualTo(original.path("operations").get(1));
        assertThat(result.path("operations").get(0).path("position")).isEqualTo(original.path("operations").get(0).path("position"));
        assertThat(result.path("inputOperationIds")).isEqualTo(original.path("inputOperationIds"));
        assertThat(result.path("outputOperationIds")).isEqualTo(original.path("outputOperationIds"));
    }

    @Test
    void convertingAConvertedModelChangesNothing() throws Exception {
        LegacyModelConverter.Result first = LegacyModelConverter.convert(model(OLD));
        LegacyModelConverter.Result second = LegacyModelConverter.convert(first.model());

        assertThat(second.changes().any()).isFalse();
        assertThat(second.model()).isEqualTo(first.model());
    }

    @Test
    void aModelWithNothingToConvertReportsNoChanges() throws Exception {
        String plain = """
                {"operations":[{"id":"n","kind":"node","name":"N","fields":{"input":{"type":"literal","value":"1"}},"operations":[]}]}""";

        assertThat(LegacyModelConverter.convert(model(plain)).changes().any()).isFalse();
    }

    private static final String WITH_FORMATTERS = """
            {"modelName":"M","operations":[
              {"id":"n1","kind":"node","name":"A","fields":{"input":{"type":"literal","value":""}},"position":{"x":1,"y":2},"operations":[]},
              {"id":"f1","kind":"formatter","name":"Perguntas","fields":{"type":"integer","required":true,"min":0,"max":9,"appliesTo":["n1"]},"position":{"x":5,"y":6},"operations":[]},
              {"id":"f2","kind":"formatter","name":"Idade","fields":{"type":"integer","required":true,"min":3,"max":17,"appliesTo":[]},"position":{"x":7,"y":8},"operations":[]}]}""";

    @Test
    void formattersLeaveTheCanvasForTheValidationSettingsKeepingIdNameAndRules() throws Exception {
        LegacyModelConverter.Result result = LegacyModelConverter.convert(model(WITH_FORMATTERS));

        assertThat(result.changes().formatters()).isEqualTo(2);
        assertThat(result.model().path("operations")).hasSize(1);
        assertThat(result.model().path("operations").get(0).path("id").asText()).isEqualTo("n1");
        JsonNode rules = result.model().path("settings").path("validation");
        assertThat(rules).hasSize(2);
        assertThat(rules.get(0).path("id").asText()).isEqualTo("f1");
        assertThat(rules.get(0).path("name").asText()).isEqualTo("Perguntas");
        assertThat(rules.get(0).path("fields")).isEqualTo(model(WITH_FORMATTERS).path("operations").get(1).path("fields"));
        assertThat(rules.get(0).has("position")).isFalse();
        assertThat(rules.get(1).path("id").asText()).isEqualTo("f2");
    }

    @Test
    void formattersAreOnlyMovedOnceAndExistingSettingsAreKept() throws Exception {
        JsonNode first = LegacyModelConverter.convert(model(WITH_FORMATTERS)).model();
        LegacyModelConverter.Result second = LegacyModelConverter.convert(first);
        assertThat(second.changes().any()).isFalse();
        assertThat(second.model()).isEqualTo(first);

        String withSettings = WITH_FORMATTERS.replace("{\"modelName\":\"M\",", "{\"modelName\":\"M\",\"settings\":{\"validation\":[{\"id\":\"old\",\"name\":\"Antiga\",\"fields\":{}}]},");
        JsonNode merged = LegacyModelConverter.convert(model(withSettings)).model();
        assertThat(merged.path("settings").path("validation")).hasSize(3);
        assertThat(merged.path("settings").path("validation").get(0).path("id").asText()).isEqualTo("old");
    }

    private static final String WITH_PAGE = """
            {"modelName":"M","operations":[
              {"id":"l","kind":"lookup","name":"Encontrar Página","fields":{},"position":{"x":1,"y":2},"operations":[
                {"id":"p","kind":"page","name":"Selecionar Página","fields":{"input":{"type":"reference","operationId":"l"}},"position":{"x":3,"y":4},"operations":[]}]}]}""";

    @Test
    void thePageSelectorLeavesTheCanvasForTheSettingsKeepingIdNameAndInput() throws Exception {
        LegacyModelConverter.Result result = LegacyModelConverter.convert(model(WITH_PAGE));

        assertThat(result.changes().pages()).isEqualTo(1);
        assertThat(result.model().path("operations").get(0).path("operations")).isEmpty();
        JsonNode page = result.model().path("settings").path("page");
        assertThat(page.path("id").asText()).isEqualTo("p");
        assertThat(page.path("name").asText()).isEqualTo("Selecionar Página");
        assertThat(page.path("fields")).isEqualTo(model(WITH_PAGE).path("operations").get(0).path("operations").get(0).path("fields"));
        assertThat(page.has("position")).isFalse();
        // Moving it again changes nothing.
        assertThat(LegacyModelConverter.convert(result.model()).changes().any()).isFalse();
    }

    private static final String WITH_ITERATOR = """
            {"modelName":"M","operations":[
              {"id":"it","kind":"iterator","name":"Iterador de Páginas","fields":{"startSheet":1,"endSheet":13,"previewSheet":"","descriptions":["A","B"]},"position":{"x":1,"y":2},"operations":[
                {"id":"s","kind":"selector","name":"Escolher Página","fields":{"index":{"type":"reference","operationId":"it"},"inputs":[]},"position":{"x":3,"y":4},"operations":[
                  {"id":"l","kind":"lookup","name":"Encontrar","fields":{"input":{"type":"reference","operationId":"s"}},"position":{"x":5,"y":6},"operations":[]}]}]}]}""";

    @Test
    void theIteratorLeavesTheCanvasForTheSettingsAndWhatWasUnderItStaysInItsPlace() throws Exception {
        LegacyModelConverter.Result result = LegacyModelConverter.convert(model(WITH_ITERATOR));

        assertThat(result.changes().iterations()).isEqualTo(1);
        // The selector (and the lookup under it) now sit where the iterator was.
        assertThat(result.model().path("operations")).hasSize(1);
        assertThat(result.model().path("operations").get(0).path("id").asText()).isEqualTo("s");
        assertThat(result.model().path("operations").get(0).path("operations").get(0).path("id").asText()).isEqualTo("l");
        JsonNode iteration = result.model().path("settings").path("iteration");
        assertThat(iteration.path("id").asText()).isEqualTo("it");
        assertThat(iteration.path("name").asText()).isEqualTo("Iterador de Páginas");
        assertThat(iteration.path("fields").path("startSheet").asInt()).isEqualTo(1);
        assertThat(iteration.path("fields").path("descriptions")).hasSize(2);
        // What referenced it still does, by the same id.
        assertThat(result.model().path("operations").get(0).path("fields").path("index").path("operationId").asText()).isEqualTo("it");
        assertThat(LegacyModelConverter.convert(result.model()).changes().any()).isFalse();
    }
}
