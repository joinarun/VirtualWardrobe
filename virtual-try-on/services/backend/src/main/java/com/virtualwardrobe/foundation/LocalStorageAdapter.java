package com.virtualwardrobe.foundation;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LocalStorageAdapter implements StorageAdapter {
    private final Path root;
    public LocalStorageAdapter(@Value("${app.local-data-directory:work/local-data}") String directory) { this.root = Path.of(directory).toAbsolutePath().normalize(); }
    private Path resolve(String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("Object key required");
        Path candidate = root.resolve(key).normalize();
        if (!candidate.startsWith(root) || candidate.equals(root)) throw new IllegalArgumentException("Invalid object key");
        return candidate;
    }
    public void put(String key, byte[] bytes) throws IOException { Path path = resolve(key); Files.createDirectories(path.getParent()); Files.write(path, bytes); }
    public byte[] read(String key) throws IOException { return Files.readAllBytes(resolve(key)); }
    public void delete(String key) throws IOException { Files.deleteIfExists(resolve(key)); }
}
