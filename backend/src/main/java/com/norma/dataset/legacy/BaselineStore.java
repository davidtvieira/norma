package com.norma.dataset.legacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

/**
 * TEMPORARY: reads what a saved norma answered before it was converted — one {@code <libraryId>.json} per norma, saved
 * from the app as it was: the inputs of each test case, and the full run response (every operation's value) for them.
 */
@Component
public class BaselineStore {

    private final Path directory;
    private final ObjectMapper mapper = new ObjectMapper();

    public BaselineStore(@Value("${norma.baseline.dir}") String directory) {
        this.directory = Path.of(directory);
    }

    public Optional<JsonNode> load(UUID id) {
        Path file = directory.resolve(id + ".json");
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(mapper.readTree(Files.readAllBytes(file)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
