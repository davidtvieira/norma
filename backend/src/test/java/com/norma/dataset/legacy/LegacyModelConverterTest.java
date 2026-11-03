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
}
