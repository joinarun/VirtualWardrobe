package com.virtualwardrobe.media;

import com.google.auth.ServiceAccountSigner;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class GcpMediaStorageTest {
    private static final String BUCKET = "test-project-private-media";
    private static final String KEY = "catalog/7f930190-79ca-442d-889f-240d4377ef60/content.jpg";
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-27T00:00:00Z"), ZoneOffset.UTC);
    private static final ServiceAccountSigner SIGNER = new ServiceAccountSigner() {
        public String getAccount() { return "media@test-project.iam.gserviceaccount.com"; }
        public byte[] sign(byte[] bytes) { return bytes.clone(); }
    };

    private GcpMediaStorage adapter(Storage storage) { return new GcpMediaStorage(storage, BUCKET, SIGNER, CLOCK); }

    @Test
    void unsafeKeysCannotReachCloudStorageOrSigning() {
        Storage client = mock(Storage.class);
        GcpMediaStorage adapter = adapter(client);
        for (String key : Arrays.asList("/private/a", "../a", "catalog/../a", "catalog/./a", "catalog//a",
                "https://example.com/a", "gs://other/a", "private/a%2Fb", "private\\a", "private/a\n")) {
            assertThrows(IllegalArgumentException.class, () -> adapter.read(key));
            assertThrows(IllegalArgumentException.class, () -> adapter.signRead(key, Duration.ofMinutes(5)));
            assertThrows(IllegalArgumentException.class, () -> adapter.delete(key));
        }
        verifyNoInteractions(client);
    }

    @Test
    void metadataLimitIsCheckedBeforeAnyDownload() throws Exception {
        Storage client = mock(Storage.class);
        Blob object = mock(Blob.class);
        when(client.get(BlobId.of(BUCKET, KEY))).thenReturn(object);
        when(object.getSize()).thenReturn(GcpMediaStorage.MAX_OBJECT_BYTES + 1);
        when(object.getGeneration()).thenReturn(17L);
        assertThrows(IOException.class, () -> adapter(client).read(KEY));
        verify(client, never()).readAllBytes(any(BlobId.class));
    }

    @Test
    void readsPinTheGenerationWhoseSizeWasValidated() throws Exception {
        Storage client = mock(Storage.class);
        Blob object = mock(Blob.class);
        byte[] bytes = new byte[] {1, 2, 3};
        when(client.get(BlobId.of(BUCKET, KEY))).thenReturn(object);
        when(object.getSize()).thenReturn(3L);
        when(object.getGeneration()).thenReturn(42L);
        when(client.readAllBytes(BlobId.of(BUCKET, KEY, 42L))).thenReturn(bytes);
        assertArrayEquals(bytes, adapter(client).read(KEY));
        verify(client).readAllBytes(BlobId.of(BUCKET, KEY, 42L));
        verify(client, never()).readAllBytes(BlobId.of(BUCKET, KEY));
    }

    @Test
    void missingOrInconsistentObjectsFailClosed() throws Exception {
        Storage client = mock(Storage.class);
        assertThrows(IOException.class, () -> adapter(client).read(KEY));
        Blob object = mock(Blob.class);
        when(client.get(BlobId.of(BUCKET, KEY))).thenReturn(object);
        when(object.getSize()).thenReturn(2L);
        when(object.getGeneration()).thenReturn(9L);
        when(client.readAllBytes(BlobId.of(BUCKET, KEY, 9L))).thenReturn(new byte[] {1});
        assertThrows(IOException.class, () -> adapter(client).read(KEY));
    }

    @Test
    void writesCarryPrivateMetadataAndTheValidatedContentType() throws Exception {
        Storage client = mock(Storage.class);
        byte[] bytes = new byte[] {1, 2, 3};
        adapter(client).put(KEY, bytes, "image/jpeg");
        var info = org.mockito.ArgumentCaptor.forClass(BlobInfo.class);
        verify(client).create(info.capture(), eq(bytes));
        assertEquals(BUCKET, info.getValue().getBucket());
        assertEquals(KEY, info.getValue().getName());
        assertEquals("image/jpeg", info.getValue().getContentType());
        assertEquals("private, no-store", info.getValue().getCacheControl());
    }

    @Test
    void deletionIsIdempotentAndStorageErrorsDoNotLeakProviderText() throws Exception {
        Storage client = mock(Storage.class);
        when(client.delete(BlobId.of(BUCKET, KEY))).thenReturn(false);
        adapter(client).delete(KEY);
        when(client.delete(BlobId.of(BUCKET, KEY))).thenThrow(new StorageException(403, "secret-request-token"));
        IOException error = assertThrows(IOException.class, () -> adapter(client).delete(KEY));
        assertEquals("Media storage is temporarily unavailable", error.getMessage());
        assertNull(error.getCause());
    }

    @Test
    void uploadAuthorizationBindsLengthTypeAndCachePolicyThroughTheSdk() throws Exception {
        // signUrl itself is local except for the injected signer's sign call.
        // This test signer has no key/credential and makes no network request.
        Storage client = StorageOptions.newBuilder().setProjectId("test-project")
                .setCredentials(GoogleCredentials.newBuilder().build()).build().getService();
        MediaStorage.SignedUpload lease = adapter(client).signUpload("quarantine/test-upload", "image/png", 1234,
                Duration.ofMinutes(5)).orElseThrow();
        Map<String, String> query = query(URI.create(lease.url()));
        assertEquals("PUT", lease.method());
        assertEquals("300", query.get("X-Goog-Expires"));
        assertEquals("GOOG4-RSA-SHA256", query.get("X-Goog-Algorithm"));
        assertTrue(query.get("X-Goog-SignedHeaders").contains("content-length"));
        assertTrue(query.get("X-Goog-SignedHeaders").contains("content-type"));
        assertTrue(query.get("X-Goog-SignedHeaders").contains("cache-control"));
        assertTrue(query.get("X-Goog-SignedHeaders").contains("x-goog-if-generation-match"));
        assertFalse(lease.headers().keySet().stream().anyMatch(key -> key.equalsIgnoreCase("Content-Length")));
        assertEquals("image/png", lease.headers().get("Content-Type"));
        assertEquals("private, no-store", lease.headers().get("Cache-Control"));
        assertEquals("0", lease.headers().get("x-goog-if-generation-match"));
        assertEquals(CLOCK.instant().plusSeconds(300), lease.expiresAt());
        assertEquals("storage.googleapis.com", URI.create(lease.url()).getHost());
    }

    @Test
    void readAuthorizationUsesV4AndAtMostFiveMinutes() throws Exception {
        Storage client = StorageOptions.newBuilder().setProjectId("test-project")
                .setCredentials(GoogleCredentials.newBuilder().build()).build().getService();
        URI uri = adapter(client).signRead(KEY, Duration.ofSeconds(45)).orElseThrow();
        assertEquals("45", query(uri).get("X-Goog-Expires"));
        assertEquals("GOOG4-RSA-SHA256", query(uri).get("X-Goog-Algorithm"));
        assertEquals("storage.googleapis.com", uri.getHost());
    }

    @Test
    void invalidAuthorizationLimitsNeverReachTheSignerOrClient() {
        Storage client = mock(Storage.class);
        GcpMediaStorage adapter = adapter(client);
        assertThrows(IllegalArgumentException.class,
                () -> adapter.signUpload(KEY, "image/png", 0, Duration.ofMinutes(5)));
        assertThrows(IllegalArgumentException.class,
                () -> adapter.signUpload(KEY, "image/png", GcpMediaStorage.MAX_OBJECT_BYTES + 1, Duration.ofMinutes(5)));
        assertThrows(IllegalArgumentException.class,
                () -> adapter.signRead(KEY, Duration.ofSeconds(301)));
        assertThrows(IllegalArgumentException.class,
                () -> adapter.signRead(KEY, Duration.ZERO));
        assertThrows(IllegalArgumentException.class,
                () -> adapter.signUpload(KEY, "text/html", 1234, Duration.ofMinutes(5)));
        verifyNoInteractions(client);
    }

    private static Map<String, String> query(URI uri) {
        return Arrays.stream(uri.getRawQuery().split("&")).map(part -> part.split("=", 2))
                .collect(Collectors.toMap(part -> decode(part[0]), part -> decode(part[1])));
    }

    private static String decode(String value) { return URLDecoder.decode(value, StandardCharsets.UTF_8); }
}
