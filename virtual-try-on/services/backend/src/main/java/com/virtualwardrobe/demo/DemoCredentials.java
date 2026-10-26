package com.virtualwardrobe.demo;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.UserPrincipal;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Local, durable credential material only. This class never connects to a database or logs. */
public final class DemoCredentials {
    private static final Set<PosixFilePermission> FILE_MODE = PosixFilePermissions.fromString("rw-------");
    private static final Set<PosixFilePermission> DIRECTORY_MODE = PosixFilePermissions.fromString("rwx------");
    private static final int MAX_FILE_BYTES = 1024 * 1024;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();
    private static final Gson JSON = new GsonBuilder().setStrictness(Strictness.STRICT)
            .disableHtmlEscaping().setPrettyPrinting().create();
    private static final Set<String> DOCUMENT_FIELDS = Set.of(
            "schemaVersion", "datasetId", "profile", "fingerprint", "createdAt", "users");
    private static final Set<String> USER_FIELDS = Set.of(
            "id", "kind", "role", "name", "identifier", "password", "storeIds", "storeNames", "recoveryCodes");

    private DemoCredentials() { }

    public record UserDefinition(UUID id, String kind, String role, String name, String identifier,
                                 List<UUID> storeIds, List<String> storeNames) {
        public UserDefinition {
            storeIds = List.copyOf(storeIds); storeNames = List.copyOf(storeNames);
        }
        @Override public String toString() { return "DemoCredentials.UserDefinition[redacted]"; }
    }

    public record User(UUID id, String kind, String role, String name, String identifier, String password,
                       List<UUID> storeIds, List<String> storeNames, List<String> recoveryCodes) {
        public User {
            storeIds = List.copyOf(storeIds); storeNames = List.copyOf(storeNames);
            recoveryCodes = List.copyOf(recoveryCodes);
        }
        @Override public String toString() { return "DemoCredentials.User[redacted]"; }
    }

    public record Bundle(int schemaVersion, String datasetId, String profile, String fingerprint,
                         String createdAt, List<User> users, Path jsonPath, Path textPath, String digest) {
        public Bundle { users = List.copyOf(users); }
        @Override public String toString() { return "DemoCredentials.Bundle[redacted]"; }
    }

    private record Document(int schemaVersion, String datasetId, String profile, String fingerprint,
                            String createdAt, List<User> users) { }

    public static Bundle loadOrCreate(Path json, String dataset, String profile, String fingerprint,
                                      List<UserDefinition> definitions, boolean datasetExists) throws IOException {
        try {
            validateDefinitions(dataset, profile, fingerprint, definitions);
            if (json == null || !json.isAbsolute() || json.getFileName() == null ||
                    !json.getFileName().toString().endsWith(".json")) throw failure("PATH_INVALID");
            Path destination = json.normalize();
            Path parent = destination.getParent();
            if (parent == null) throw failure("PATH_INVALID");
            Path text = destination.resolveSibling(destination.getFileName().toString().replaceFirst("\\.json$", ".txt"));
            synchronized (JVM_LOCKS.computeIfAbsent(destination, ignored -> new Object())) {
                UserPrincipal owner = parent.getFileSystem().getUserPrincipalLookupService()
                        .lookupPrincipalByName(System.getProperty("user.name"));
                secureDirectory(parent, owner);
                Path lock = destination.resolveSibling(destination.getFileName() + ".lock");
                try (FileChannel channel = openLock(lock, owner); FileLock held = channel.lock()) {
                    return locked(destination, text, dataset, profile, fingerprint, List.copyOf(definitions),
                            datasetExists, owner);
                }
            }
        } catch (CredentialFailure error) {
            throw error;
        } catch (IOException | RuntimeException error) {
            // Provider/parser/filesystem errors may embed paths or credential bytes.
            // Keep the original exception out of the message and cause chain.
            throw failure("IO_FAILED");
        }
    }

    private static Bundle locked(Path json, Path text, String dataset, String profile, String fingerprint,
                                  List<UserDefinition> definitions, boolean datasetExists, UserPrincipal owner)
            throws IOException {
        Document document;
        byte[] bytes;
        if (Files.exists(json, LinkOption.NOFOLLOW_LINKS)) {
            bytes = secureRead(json, owner);
            document = parse(bytes);
            validateDocument(document, dataset, profile, fingerprint, definitions);
        } else {
            if (datasetExists) throw failure("MISSING_EXISTING");
            if (Files.exists(text, LinkOption.NOFOLLOW_LINKS)) throw failure("ORPHAN_TEXT");
            document = generate(dataset, profile, fingerprint, definitions);
            bytes = (JSON.toJson(document) + "\n").getBytes(StandardCharsets.UTF_8);
            atomicCreate(json, bytes, owner);
        }
        byte[] readable = readable(document).getBytes(StandardCharsets.UTF_8);
        if (Files.exists(text, LinkOption.NOFOLLOW_LINKS)) {
            if (!MessageDigest.isEqual(secureRead(text, owner), readable)) throw failure("TEXT_MISMATCH");
        } else {
            // A crash after the JSON rename may leave the text copy missing.
            // Rebuild it from those persisted secrets; never generate replacements.
            atomicCreate(text, readable, owner);
        }
        return new Bundle(1, dataset, profile, fingerprint, document.createdAt(), document.users(),
                json, text, digest(bytes));
    }

    private static Document generate(String dataset, String profile, String fingerprint,
                                      List<UserDefinition> definitions) {
        Set<String> used = new HashSet<>();
        List<User> users = new ArrayList<>();
        for (UserDefinition definition : definitions) {
            String password = secret(used);
            List<String> codes = new ArrayList<>();
            if (definition.kind().equals("CUSTOMER")) for (int i = 0; i < 8; i++) codes.add(secret(used));
            users.add(new User(definition.id(), definition.kind(), definition.role(), definition.name(),
                    definition.identifier(), password, definition.storeIds(), definition.storeNames(), codes));
        }
        return new Document(1, dataset, profile, fingerprint, Instant.now().toString(), List.copyOf(users));
    }

    private static String secret(Set<String> used) {
        String value;
        do {
            byte[] bytes = new byte[24]; RANDOM.nextBytes(bytes);
            value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (!used.add(value));
        return value;
    }

    private static void validateDefinitions(String dataset, String profile, String fingerprint,
                                             List<UserDefinition> definitions) throws IOException {
        if (dataset == null || !dataset.matches("[a-z][a-z0-9-]{2,49}") ||
                !Set.of("standard", "load").contains(profile) || fingerprint == null ||
                !fingerprint.matches("[0-9a-f]{64}") || definitions == null ||
                definitions.isEmpty() || definitions.size() > 100) throw failure("DEFINITION_INVALID");
        Set<UUID> ids = new HashSet<>(); Set<String> identifiers = new HashSet<>();
        for (UserDefinition definition : definitions) {
            if (definition == null || definition.id() == null || !ids.add(definition.id()) ||
                    !validText(definition.name(), 120) || !validText(definition.identifier(), 254) ||
                    !identifiers.add(definition.kind() + ":" + definition.identifier()) ||
                    definition.storeIds().size() != definition.storeNames().size() ||
                    new HashSet<>(definition.storeIds()).size() != definition.storeIds().size() ||
                    definition.storeNames().stream().anyMatch(name -> !validText(name, 120))) throw failure("DEFINITION_INVALID");
            boolean customer = "CUSTOMER".equals(definition.kind());
            boolean workforce = "WORKFORCE".equals(definition.kind());
            if ((!customer && !workforce) ||
                    (customer && (!"CUSTOMER".equals(definition.role()) ||
                            !definition.identifier().matches("\\+[1-9][0-9]{7,14}") || !definition.storeIds().isEmpty())) ||
                    (workforce && (!Set.of("SUPER_ADMIN", "STORE_ADMIN", "STAFF").contains(definition.role()) ||
                            definition.identifier().length() > 254 ||
                            !definition.identifier().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")))) throw failure("DEFINITION_INVALID");
        }
    }

    private static boolean validText(String value, int limit) {
        return value != null && !value.isBlank() && value.length() <= limit &&
                value.chars().noneMatch(Character::isISOControl);
    }

    private static Document parse(byte[] bytes) throws IOException {
        try {
            String encoded = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
            try (JsonReader reader = new JsonReader(new StringReader(encoded))) {
                reader.setStrictness(Strictness.STRICT); validateJson(reader, 0);
                if (reader.peek() != JsonToken.END_DOCUMENT) throw failure("CONTENT_INVALID");
            }
            JsonObject value = JsonParser.parseString(encoded).getAsJsonObject();
            if (!value.keySet().equals(DOCUMENT_FIELDS) || !value.get("schemaVersion").isJsonPrimitive() ||
                    !value.getAsJsonPrimitive("schemaVersion").isNumber() ||
                    !"1".equals(value.get("schemaVersion").getAsString()) ||
                    !stringFields(value, Set.of("datasetId", "profile", "fingerprint", "createdAt")) ||
                    !value.get("users").isJsonArray()) throw failure("CONTENT_INVALID");
            for (var user : value.getAsJsonArray("users")) {
                if (!user.isJsonObject() || !user.getAsJsonObject().keySet().equals(USER_FIELDS)) throw failure("CONTENT_INVALID");
                JsonObject fields = user.getAsJsonObject();
                if (!stringFields(fields, Set.of("id", "kind", "role", "name", "identifier", "password"))) throw failure("CONTENT_INVALID");
                for (String key : List.of("storeIds", "storeNames", "recoveryCodes")) {
                    if (!fields.get(key).isJsonArray()) throw failure("CONTENT_INVALID");
                    for (var item : fields.getAsJsonArray(key))
                        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString()) throw failure("CONTENT_INVALID");
                }
            }
            return JSON.fromJson(value, Document.class);
        } catch (CredentialFailure error) { throw error; }
        catch (RuntimeException error) { throw failure("CONTENT_INVALID"); }
    }

    private static boolean stringFields(JsonObject value, Set<String> fields) {
        return fields.stream().allMatch(field -> value.get(field).isJsonPrimitive() &&
                value.getAsJsonPrimitive(field).isString());
    }

    private static void validateJson(JsonReader reader, int depth) throws IOException {
        if (depth > 8) throw failure("CONTENT_INVALID");
        switch (reader.peek()) {
            case BEGIN_OBJECT -> {
                reader.beginObject(); Set<String> names = new HashSet<>();
                while (reader.hasNext()) {
                    if (!names.add(reader.nextName())) throw failure("CONTENT_INVALID");
                    validateJson(reader, depth + 1);
                }
                reader.endObject();
            }
            case BEGIN_ARRAY -> {
                reader.beginArray();
                while (reader.hasNext()) validateJson(reader, depth + 1);
                reader.endArray();
            }
            case STRING, NUMBER, BOOLEAN, NULL -> reader.skipValue();
            default -> throw failure("CONTENT_INVALID");
        }
    }

    private static void validateDocument(Document document, String dataset, String profile, String fingerprint,
                                          List<UserDefinition> definitions) throws IOException {
        if (document == null || document.schemaVersion() != 1 || !dataset.equals(document.datasetId()) ||
                !profile.equals(document.profile()) || !fingerprint.equals(document.fingerprint()) ||
                document.users() == null || document.users().size() != definitions.size()) throw failure("MANIFEST_MISMATCH");
        try { Instant.parse(document.createdAt()); }
        catch (RuntimeException error) { throw failure("CONTENT_INVALID"); }
        Map<UUID, UserDefinition> expected = new java.util.HashMap<>();
        definitions.forEach(definition -> expected.put(definition.id(), definition));
        Set<String> secrets = new HashSet<>(); Set<UUID> ids = new HashSet<>();
        for (User user : document.users()) {
            UserDefinition definition = user == null ? null : expected.get(user.id());
            if (definition == null || !ids.add(user.id()) || !definition.kind().equals(user.kind()) ||
                    !definition.role().equals(user.role()) || !definition.name().equals(user.name()) ||
                    !definition.identifier().equals(user.identifier()) ||
                    !definition.storeIds().equals(user.storeIds()) || !definition.storeNames().equals(user.storeNames()))
                throw failure("MANIFEST_MISMATCH");
            if (!validSecret(user.password(), secrets) || user.recoveryCodes().size() !=
                    (user.kind().equals("CUSTOMER") ? 8 : 0)) throw failure("CONTENT_INVALID");
            for (String code : user.recoveryCodes()) if (!validSecret(code, secrets)) throw failure("CONTENT_INVALID");
        }
    }

    private static boolean validSecret(String value, Set<String> used) {
        return value != null && value.matches("[A-Za-z0-9_-]{32}") && used.add(value);
    }

    private static String readable(Document document) {
        StringBuilder text = new StringBuilder("VirtualWardrobe fictional demo credentials\n")
                .append("Dataset: ").append(document.datasetId()).append("\nProfile: ").append(document.profile())
                .append("\nCreated: ").append(document.createdAt()).append("\n\n")
                .append("Private local file. Never publish or commit these credentials.\n")
                .append("Workforce accounts must change the temporary password on first login.\n")
                .append("Customer phone numbers are fictional, unverified demo identifiers.\n\n");
        for (User user : document.users()) {
            text.append(user.role()).append(" | ").append(user.name()).append("\nIdentifier: ")
                    .append(user.identifier()).append("\nPassword: ").append(user.password()).append("\n");
            if (!user.storeNames().isEmpty()) text.append("Stores: ").append(String.join(", ", user.storeNames())).append("\n");
            if (!user.recoveryCodes().isEmpty()) text.append("One-use recovery codes: ")
                    .append(String.join(" ", user.recoveryCodes())).append("\n");
            text.append("\n");
        }
        return text.toString();
    }

    private static void secureDirectory(Path directory, UserPrincipal owner) throws IOException {
        Path cursor = directory.getRoot();
        for (Path part : directory) {
            cursor = cursor.resolve(part);
            if (!Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) {
                try {
                    Files.createDirectory(cursor, PosixFilePermissions.asFileAttribute(DIRECTORY_MODE));
                    forceDirectory(cursor.getParent());
                }
                catch (FileAlreadyExistsException ignored) { /* Recheck the concurrent creation below. */ }
            }
            var attributes = Files.readAttributes(cursor, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (attributes.isSymbolicLink() || !attributes.isDirectory()) throw failure("UNSAFE_DIRECTORY");
            int mode = ((Number) Files.getAttribute(cursor, "unix:mode", LinkOption.NOFOLLOW_LINKS)).intValue();
            if ((mode & 0022) != 0 && (mode & 01000) == 0) throw failure("UNSAFE_DIRECTORY");
        }
        var attributes = Files.readAttributes(directory, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attributes.owner().equals(owner) || !attributes.permissions().equals(DIRECTORY_MODE)) throw failure("UNSAFE_DIRECTORY");
    }

    private static void secureFile(Path path, UserPrincipal owner) throws IOException {
        var attributes = Files.readAttributes(path, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        Object links = Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
        if (attributes.isSymbolicLink() || !attributes.isRegularFile() || !attributes.owner().equals(owner) ||
                !attributes.permissions().equals(FILE_MODE) || !(links instanceof Number count) || count.longValue() != 1 ||
                attributes.size() > MAX_FILE_BYTES) throw failure("UNSAFE_FILE");
    }

    private static FileChannel openLock(Path lock, UserPrincipal owner) throws IOException {
        try {
            FileChannel created = FileChannel.open(lock, Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE,
                    LinkOption.NOFOLLOW_LINKS), PosixFilePermissions.asFileAttribute(FILE_MODE));
            try { secureFile(lock, owner); return created; }
            catch (IOException error) { created.close(); throw error; }
        } catch (FileAlreadyExistsException ignored) {
            secureFile(lock, owner);
            return FileChannel.open(lock, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
        }
    }

    private static byte[] secureRead(Path path, UserPrincipal owner) throws IOException {
        secureFile(path, owner);
        try (FileChannel channel = FileChannel.open(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            ByteBuffer buffer = ByteBuffer.allocate(8192);
            while (channel.read(buffer) != -1) {
                if (bytes.size() + buffer.position() > MAX_FILE_BYTES) throw failure("CONTENT_INVALID");
                bytes.write(buffer.array(), 0, buffer.position()); buffer.clear();
            }
            return bytes.toByteArray();
        }
    }

    private static void atomicCreate(Path path, byte[] bytes, UserPrincipal owner) throws IOException {
        if (bytes.length > MAX_FILE_BYTES || Files.exists(path, LinkOption.NOFOLLOW_LINKS)) throw failure("CREATE_CONFLICT");
        Path temporary = path.resolveSibling("." + path.getFileName() + "." + UUID.randomUUID() + ".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temporary, Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE,
                    LinkOption.NOFOLLOW_LINKS), PosixFilePermissions.asFileAttribute(FILE_MODE))) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            secureFile(temporary, owner);
            Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE);
            forceDirectory(path.getParent());
            secureFile(path, owner);
        } finally { Files.deleteIfExists(temporary); }
    }

    private static void forceDirectory(Path path) throws IOException {
        try (FileChannel directory = FileChannel.open(path, StandardOpenOption.READ)) { directory.force(true); }
    }

    private static String digest(byte[] bytes) throws IOException {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException error) { throw failure("DIGEST_FAILED"); }
    }

    private static CredentialFailure failure(String code) { return new CredentialFailure("DEMO_CREDENTIALS_" + code); }
    private static final class CredentialFailure extends IOException {
        private CredentialFailure(String code) { super(code); }
    }
}
