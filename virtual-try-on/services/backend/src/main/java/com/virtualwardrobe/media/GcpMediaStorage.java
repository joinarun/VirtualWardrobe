package com.virtualwardrobe.media;

import com.google.auth.ServiceAccountSigner;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ImpersonatedCredentials;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.HttpMethod;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Cloud bytes and URL signing only; ownership/store authorization belongs to MediaService. */
@Component
@ConditionalOnProperty(name = "app.adapter-mode", havingValue = "gcp")
public final class GcpMediaStorage implements MediaStorage {
    static final long MAX_OBJECT_BYTES = 50L * 1024 * 1024;
    private static final String CACHE_CONTROL = "private, no-store";
    private static final String CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
    private static final Set<String> CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "video/mp4");

    private final Storage storage;
    private final String bucket;
    private final ServiceAccountSigner signer;
    private final Clock clock;

    @Autowired
    public GcpMediaStorage(
            @Value("${APP_STORAGE_BUCKET:}") String bucket,
            @Value("${APP_STORAGE_SIGNER_SERVICE_ACCOUNT:}") String signerAccount,
            @Value("${APP_GCP_PROJECT:${GOOGLE_CLOUD_PROJECT:}}") String project) throws IOException {
        this.bucket = validBucket(bucket);
        if (project == null || !project.matches("[a-z][a-z0-9-]{4,28}[a-z0-9]") ||
                signerAccount == null ||
                !signerAccount.matches("[a-z0-9-]+@[a-z0-9-]+\\.iam\\.gserviceaccount\\.com")) {
            throw new IllegalArgumentException("Cloud media project and signing identity must be configured");
        }
        GoogleCredentials source = GoogleCredentials.getApplicationDefault().createScoped(List.of(CLOUD_SCOPE));
        this.storage = StorageOptions.newBuilder().setProjectId(project).setCredentials(source).build().getService();
        // Use source ADC for object operations. This credential is ONLY a signer:
        // ImpersonatedCredentials.sign calls IAM signBlob with source credentials.
        // It never refreshes/mints an impersonated target access token here.
        this.signer = ImpersonatedCredentials.create(source, signerAccount, List.of(), List.of(CLOUD_SCOPE), 300);
        this.clock = Clock.systemUTC();
    }

    GcpMediaStorage(Storage storage, String bucket, ServiceAccountSigner signer, Clock clock) {
        this.storage = Objects.requireNonNull(storage);
        this.bucket = validBucket(bucket);
        this.signer = Objects.requireNonNull(signer);
        this.clock = Objects.requireNonNull(clock);
    }

    @Override
    public void put(String key, byte[] bytes, String contentType) throws IOException {
        validKey(key);
        validContentType(contentType);
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_OBJECT_BYTES) {
            throw new IOException("Media size is outside the supported limit");
        }
        BlobInfo object = BlobInfo.newBuilder(bucket, key).setContentType(contentType)
                .setCacheControl(CACHE_CONTROL).build();
        try {
            storage.create(object, bytes);
        } catch (StorageException error) {
            throw unavailable();
        }
    }

    @Override
    public byte[] read(String key) throws IOException {
        validKey(key);
        try {
            Blob object = storage.get(BlobId.of(bucket, key));
            if (object == null) throw new IOException("Media was not found");
            Long length = object.getSize();
            Long generation = object.getGeneration();
            if (length == null || length < 0 || length > MAX_OBJECT_BYTES || generation == null) {
                throw new IOException("Media size is outside the supported limit");
            }
            // Pin the checked generation: a still-valid upload URL must not be
            // able to replace a small object with a large one between metadata
            // validation and download.
            byte[] result = storage.readAllBytes(BlobId.of(bucket, key, generation));
            if (result.length != length || result.length > MAX_OBJECT_BYTES) {
                throw new IOException("Media content was inconsistent");
            }
            return result;
        } catch (StorageException error) {
            throw error.getCode() == 404 ? new IOException("Media was not found") : unavailable();
        }
    }

    @Override
    public void delete(String key) throws IOException {
        validKey(key);
        try {
            storage.delete(BlobId.of(bucket, key));
        } catch (StorageException error) {
            if (error.getCode() != 404) throw unavailable();
        }
    }

    @Override
    public Optional<SignedUpload> signUpload(String key, String contentType, long expectedBytes, Duration ttl)
            throws IOException {
        validKey(key);
        validContentType(contentType);
        long seconds = validTtl(ttl);
        if (expectedBytes <= 0 || expectedBytes > MAX_OBJECT_BYTES) {
            throw new IllegalArgumentException("Upload size is outside the supported limit");
        }
        BlobInfo object = BlobInfo.newBuilder(bucket, key).setContentType(contentType).build();
        try {
            URI url = storage.signUrl(object, seconds, TimeUnit.SECONDS,
                    Storage.SignUrlOption.withV4Signature(),
                    Storage.SignUrlOption.httpMethod(HttpMethod.PUT),
                    Storage.SignUrlOption.withContentType(),
                    Storage.SignUrlOption.withExtHeaders(Map.of(
                            "content-type", contentType,
                            "content-length", Long.toString(expectedBytes),
                            "cache-control", CACHE_CONTROL,
                            "x-goog-if-generation-match", "0")),
                    Storage.SignUrlOption.signWith(signer)).toURI();
            // Content-Length is signed but is a forbidden script-set browser
            // header. Browser fetch sets it automatically from the Blob body.
            return Optional.of(new SignedUpload(url.toASCIIString(), "PUT",
                    Map.of("Content-Type", contentType, "Cache-Control", CACHE_CONTROL,
                            "x-goog-if-generation-match", "0"),
                    clock.instant().plusSeconds(seconds)));
        } catch (RuntimeException | URISyntaxException error) {
            throw new IOException("Media upload authorization is temporarily unavailable");
        }
    }

    @Override
    public Optional<URI> signRead(String key, Duration ttl) throws IOException {
        validKey(key);
        long seconds = validTtl(ttl);
        try {
            URI url = storage.signUrl(BlobInfo.newBuilder(bucket, key).build(), seconds, TimeUnit.SECONDS,
                    Storage.SignUrlOption.withV4Signature(), Storage.SignUrlOption.httpMethod(HttpMethod.GET),
                    Storage.SignUrlOption.signWith(signer)).toURI();
            return Optional.of(url);
        } catch (RuntimeException | URISyntaxException error) {
            throw new IOException("Media read authorization is temporarily unavailable");
        }
    }

    private static String validBucket(String bucket) {
        if (bucket == null || !bucket.matches("[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]") ||
                bucket.contains("..")) {
            throw new IllegalArgumentException("A valid private media bucket must be configured");
        }
        return bucket;
    }

    private static void validKey(String key) {
        if (key == null || key.length() > 1024 || !key.matches("[a-zA-Z0-9_./-]+")) {
            throw new IllegalArgumentException("Invalid media object key");
        }
        for (String segment : key.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
                throw new IllegalArgumentException("Invalid media object key");
            }
        }
    }

    private static void validContentType(String contentType) {
        if (contentType == null || !CONTENT_TYPES.contains(contentType)) throw new IllegalArgumentException("Unsupported media type");
    }

    private static long validTtl(Duration ttl) {
        if (ttl == null || ttl.compareTo(Duration.ofSeconds(1)) < 0 || ttl.compareTo(Duration.ofMinutes(5)) > 0) {
            throw new IllegalArgumentException("Media authorization duration must be between one and 300 seconds");
        }
        return ttl.toSeconds();
    }

    private static IOException unavailable() {
        // SDK exception text can contain request URLs. Do not expose/log it.
        return new IOException("Media storage is temporarily unavailable");
    }
}
