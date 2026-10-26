package com.virtualwardrobe.demo;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class DemoCredentialsTest {
    private static final String DATASET = "virtualwardrobe-demo-v1";
    private static final String FINGERPRINT = "a".repeat(64);
    private static final UUID STORE = UUID.fromString("00000000-0000-4000-8000-000000000001");
    @TempDir Path temporary;

    private static List<DemoCredentials.UserDefinition> definitions() {
        return List.of(new DemoCredentials.UserDefinition(UUID.fromString("00000000-0000-4000-8000-000000000002"),
                        "WORKFORCE", "SUPER_ADMIN", "Demo Admin", "admin@example.test", List.of(STORE), List.of("Demo Store")),
                new DemoCredentials.UserDefinition(UUID.fromString("00000000-0000-4000-8000-000000000003"),
                        "CUSTOMER", "CUSTOMER", "Demo Customer", "+919000000001", List.of(), List.of()));
    }

    private Path json() throws IOException { return temporary.toRealPath().resolve("private/demo-credentials.json"); }
    private DemoCredentials.Bundle load(boolean exists) throws IOException {
        return DemoCredentials.loadOrCreate(json(), DATASET, "standard", FINGERPRINT, definitions(), exists);
    }
    private static JsonObject document(Path path) throws IOException {
        return JsonParser.parseString(Files.readString(path)).getAsJsonObject();
    }
    private static void write(Path path, JsonObject value) throws IOException { Files.writeString(path, value.toString() + "\n"); }

    @Test void generatedCredentialsArePrivateUniqueAndExactlyContracted() throws Exception {
        var bundle = load(false);
        assertEquals(PosixFilePermissions.fromString("rwx------"), Files.getPosixFilePermissions(bundle.jsonPath().getParent()));
        for (Path path : List.of(bundle.jsonPath(), bundle.textPath(), bundle.jsonPath().resolveSibling("demo-credentials.json.lock")))
            assertEquals(PosixFilePermissions.fromString("rw-------"), Files.getPosixFilePermissions(path));
        assertEquals(Set.of("schemaVersion", "datasetId", "profile", "fingerprint", "createdAt", "users"), document(bundle.jsonPath()).keySet());
        assertEquals(2, bundle.users().size());
        Set<String> secrets = new HashSet<>();
        for (var user : bundle.users()) {
            assertTrue(user.password().matches("[A-Za-z0-9_-]{32}"));
            assertTrue(secrets.add(user.password()));
            assertEquals(user.kind().equals("CUSTOMER") ? 8 : 0, user.recoveryCodes().size());
            for (String code : user.recoveryCodes()) { assertTrue(code.matches("[A-Za-z0-9_-]{32}")); assertTrue(secrets.add(code)); }
            assertFalse(user.toString().contains(user.password()));
            assertFalse(bundle.toString().contains(user.password()));
            assertTrue(Files.readString(bundle.textPath()).contains(user.password()));
        }
        assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(bundle.jsonPath()))), bundle.digest());
        assertFalse(document(bundle.jsonPath()).has("digest"));
        assertFalse(document(bundle.jsonPath()).has("jsonPath"));
    }

    @Test void resumedAndExistingDatasetsReuseExactDurableBytes() throws Exception {
        var original = load(false);
        byte[] json = Files.readAllBytes(original.jsonPath()), text = Files.readAllBytes(original.textPath());
        for (boolean exists : List.of(false, true)) {
            var resumed = load(exists);
            assertTrue(original.users().equals(resumed.users()));
            assertEquals(original.createdAt(), resumed.createdAt());
            assertEquals(original.digest(), resumed.digest());
            assertTrue(MessageDigest.isEqual(json, Files.readAllBytes(resumed.jsonPath())));
            assertTrue(MessageDigest.isEqual(text, Files.readAllBytes(resumed.textPath())));
        }
        assertThrows(UnsupportedOperationException.class, () -> original.users().clear());
        assertThrows(UnsupportedOperationException.class, () -> original.users().get(1).recoveryCodes().clear());
    }

    @Test void missingExistingJsonNeverFabricatesReplacementSecrets() throws Exception {
        var original = load(false);
        Files.delete(original.jsonPath());
        byte[] text = Files.readAllBytes(original.textPath());
        var failure = assertThrows(IOException.class, () -> load(true));
        assertEquals("DEMO_CREDENTIALS_MISSING_EXISTING", failure.getMessage());
        assertFalse(Files.exists(original.jsonPath()));
        assertTrue(MessageDigest.isEqual(text, Files.readAllBytes(original.textPath())));
    }

    @Test void orphanTextBlocksNewGenerationEvenWithoutADatasetRow() throws Exception {
        var original = load(false); Files.delete(original.jsonPath());
        var failure = assertThrows(IOException.class, () -> load(false));
        assertEquals("DEMO_CREDENTIALS_ORPHAN_TEXT", failure.getMessage());
        assertFalse(Files.exists(original.jsonPath()));
    }

    @Test void missingTextResumesFromTheJsonWithoutChangingSecrets() throws Exception {
        var original = load(false); byte[] text = Files.readAllBytes(original.textPath());
        Files.delete(original.textPath());
        var restored = load(true);
        assertEquals(original.digest(), restored.digest());
        assertTrue(original.users().equals(restored.users()));
        assertTrue(MessageDigest.isEqual(text, Files.readAllBytes(restored.textPath())));
    }

    @Test void datasetProfileFingerprintAndIdentityChangesAreRejected() throws Exception {
        var original = load(false); byte[] bytes = Files.readAllBytes(original.jsonPath());
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), "different-dataset", "standard", FINGERPRINT, definitions(), true));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "load", FINGERPRINT, definitions(), true));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "standard", "b".repeat(64), definitions(), true));
        var definitions = new ArrayList<>(definitions());
        var user = definitions.getFirst();
        definitions.set(0, new DemoCredentials.UserDefinition(user.id(), user.kind(), user.role(), user.name(), "changed@example.test", user.storeIds(), user.storeNames()));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "standard", FINGERPRINT, definitions, true));
        assertTrue(MessageDigest.isEqual(bytes, Files.readAllBytes(original.jsonPath())));
    }

    @Test void corruptJsonAndTextNeverLeakContentOrOverwriteFiles() throws Exception {
        var original = load(false);
        String corrupt = "{\"password\":\"SECRET_MUST_NOT_APPEAR\"";
        Files.writeString(original.jsonPath(), corrupt);
        var failure = assertThrows(IOException.class, () -> load(true));
        assertTrue(failure.getMessage().startsWith("DEMO_CREDENTIALS_"));
        assertFalse(failure.getMessage().contains("SECRET_MUST_NOT_APPEAR"));
        assertNull(failure.getCause());
        assertTrue(corrupt.equals(Files.readString(original.jsonPath())));
        Files.delete(original.jsonPath()); Files.delete(original.textPath());
        original = load(false);
        Files.writeString(original.textPath(), "SECRET_MUST_NOT_APPEAR");
        assertEquals("DEMO_CREDENTIALS_TEXT_MISMATCH", assertThrows(IOException.class, () -> load(true)).getMessage());
        assertTrue("SECRET_MUST_NOT_APPEAR".equals(Files.readString(original.textPath())));
    }

    @Test void duplicateSecretsWrongRecoveryCountsUnknownFieldsAndDuplicateJsonKeysAreRejected() throws Exception {
        var bundle = load(false); byte[] clean = Files.readAllBytes(bundle.jsonPath());
        var value = document(bundle.jsonPath());
        var customer = value.getAsJsonArray("users").get(1).getAsJsonObject();
        customer.getAsJsonArray("recoveryCodes").set(0, customer.get("password"));
        write(bundle.jsonPath(), value);
        assertThrows(IOException.class, () -> load(true));
        Files.write(bundle.jsonPath(), clean); value = document(bundle.jsonPath());
        value.getAsJsonArray("users").get(1).getAsJsonObject().getAsJsonArray("recoveryCodes").remove(0);
        write(bundle.jsonPath(), value); assertThrows(IOException.class, () -> load(true));
        Files.write(bundle.jsonPath(), clean); value = document(bundle.jsonPath());
        value.addProperty("extra", "ignored-secret"); write(bundle.jsonPath(), value);
        assertThrows(IOException.class, () -> load(true));
        String duplicate = new String(clean, StandardCharsets.UTF_8).replaceFirst("\\{", "{\"schemaVersion\":1,");
        Files.writeString(bundle.jsonPath(), duplicate);
        assertThrows(IOException.class, () -> load(true));
        Files.write(bundle.jsonPath(), clean); value = document(bundle.jsonPath());
        value.addProperty("schemaVersion", "1"); write(bundle.jsonPath(), value);
        assertThrows(IOException.class, () -> load(true));
    }

    @Test void symlinkedJsonTextAndLockFilesAreRefusedWithoutTouchingTargets() throws Exception {
        var bundle = load(false);
        Path target = temporary.toRealPath().resolve("outside"); Files.writeString(target, "do-not-touch");
        for (Path path : List.of(bundle.jsonPath(), bundle.textPath(), bundle.jsonPath().resolveSibling("demo-credentials.json.lock"))) {
            byte[] bytes = Files.readAllBytes(path); Files.delete(path); Files.createSymbolicLink(path, target);
            assertThrows(IOException.class, () -> load(true));
            assertTrue("do-not-touch".equals(Files.readString(target)));
            Files.delete(path); Files.write(path, bytes); Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-------"));
        }
    }

    @Test void hardLinkedOrSharedCredentialFilesAreRefused() throws Exception {
        var bundle = load(false);
        for (Path path : List.of(bundle.jsonPath(), bundle.textPath(), bundle.jsonPath().resolveSibling("demo-credentials.json.lock"))) {
            Path alias = temporary.toRealPath().resolve("hardlink"); Files.createLink(alias, path);
            assertEquals("DEMO_CREDENTIALS_UNSAFE_FILE", assertThrows(IOException.class, () -> load(true)).getMessage());
            Files.delete(alias);
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-r--r--"));
            assertEquals("DEMO_CREDENTIALS_UNSAFE_FILE", assertThrows(IOException.class, () -> load(true)).getMessage());
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rw-------"));
        }
    }

    @Test void unsafeAndSymlinkedParentDirectoriesAreRefusedWithoutChmod() throws Exception {
        Path directory = temporary.toRealPath().resolve("shared"); Files.createDirectory(directory);
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(directory.resolve("creds.json"), DATASET, "standard", FINGERPRINT, definitions(), false));
        assertEquals(PosixFilePermissions.fromString("rwxr-xr-x"), Files.getPosixFilePermissions(directory));
        Path alias = temporary.toRealPath().resolve("alias"); Files.createSymbolicLink(alias, directory);
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(alias.resolve("creds.json"), DATASET, "standard", FINGERPRINT, definitions(), false));
        assertFalse(Files.exists(directory.resolve("creds.json")));
    }

    @Test void invalidDefinitionsFailBeforeCreatingCredentialDirectories() throws Exception {
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), "../invalid", "standard", FINGERPRINT, definitions(), false));
        assertFalse(Files.exists(json().getParent()));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "unknown", FINGERPRINT, definitions(), false));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "standard", "short", definitions(), false));
        assertThrows(IOException.class, () -> DemoCredentials.loadOrCreate(json(), DATASET, "standard", FINGERPRINT, List.of(definitions().getFirst(), definitions().getFirst()), false));
        assertFalse(Files.exists(json().getParent()));
    }

    @Test void boundedReadsRefuseOversizedCredentialFiles() throws Exception {
        var bundle = load(false); Files.write(bundle.jsonPath(), new byte[1024 * 1024 + 1]);
        assertEquals("DEMO_CREDENTIALS_UNSAFE_FILE", assertThrows(IOException.class, () -> load(true)).getMessage());
    }

    @Test void simultaneousThreadsGenerateExactlyOneCredentialSet() throws Exception {
        Path path = json();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = new ArrayList<java.util.concurrent.Callable<DemoCredentials.Bundle>>();
            for (int i = 0; i < 24; i++) tasks.add(() -> DemoCredentials.loadOrCreate(path, DATASET, "standard", FINGERPRINT, definitions(), false));
            var results = executor.invokeAll(tasks);
            var first = results.getFirst().get(10, TimeUnit.SECONDS);
            for (var result : results) {
                var bundle = result.get(10, TimeUnit.SECONDS);
                assertEquals(first.digest(), bundle.digest()); assertTrue(first.users().equals(bundle.users()));
            }
        }
        try (var paths = Files.list(path.getParent())) { assertEquals(3, paths.count()); }
    }

    @Test void simultaneousProcessesShareThePersistentFileLock() throws Exception {
        Path path = json();
        String java = Path.of(System.getProperty("java.home"), "bin/java").toString();
        String classpath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
        List<Process> processes = new ArrayList<>();
        try {
            for (int i = 0; i < 4; i++) processes.add(new ProcessBuilder(java, "-cp", classpath,
                    CredentialWriter.class.getName(), path.toString()).redirectError(ProcessBuilder.Redirect.DISCARD)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).start());
            for (Process process : processes) {
                assertTrue(process.waitFor(20, TimeUnit.SECONDS)); assertEquals(0, process.exitValue());
            }
            load(true);
            try (var paths = Files.list(path.getParent())) { assertEquals(3, paths.count()); }
        } finally { for (Process process : processes) if (process.isAlive()) process.destroyForcibly(); }
    }

    public static final class CredentialWriter {
        public static void main(String[] args) throws Exception {
            DemoCredentials.loadOrCreate(Path.of(args[0]), DATASET, "standard", FINGERPRINT, definitions(), false);
        }
    }
}
