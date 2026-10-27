package com.norma.dataset.library;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;

/**
 * The folder the saved .nrm files live in, one {@code <id>.nrm} each. A file's name is always the id the
 * server generated — never anything the user typed — so no name can point outside the folder. A write goes
 * to a temporary file that is then moved into place, so a crash never leaves a half-written .nrm behind.
 */
@Component
public class NrmFileStorage {

    private final Path root;

    public NrmFileStorage(@Value("${norma.storage.dir}") String directory) {
        this.root = Path.of(directory).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create the .nrm storage folder " + root, e);
        }
    }

    public void write(UUID id, byte[] bytes) {
        try {
            Path temporary = Files.createTempFile(root, id + "-", ".tmp");
            try {
                Files.write(temporary, bytes);
                Files.move(temporary, pathOf(id), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot write the .nrm " + id, e);
        }
    }

    /** The file's bytes, or empty when it is not in the folder. */
    public Optional<byte[]> read(UUID id) {
        try {
            return Optional.of(Files.readAllBytes(pathOf(id)));
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the .nrm " + id, e);
        }
    }

    public boolean exists(UUID id) {
        return Files.isRegularFile(pathOf(id));
    }

    public void delete(UUID id) {
        try {
            Files.deleteIfExists(pathOf(id));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot delete the .nrm " + id, e);
        }
    }

    private Path pathOf(UUID id) {
        return root.resolve(id + ".nrm");
    }
}
