package com.virtualwardrobe.worker;

import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.json.webtoken.JsonWebSignature;
import com.google.api.client.json.webtoken.JsonWebToken;
import com.google.auth.oauth2.TokenVerifier;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GcpWorkerTokenVerifierTest {
    private static final String WORKER = "https://virtualwardrobe-worker-123.asia-south1.run.app";
    private static final String SERVICE_ACCOUNT = "dispatch@test-project.iam.gserviceaccount.com";
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-27T12:00:00Z"), ZoneOffset.UTC);
    private static final long NOW = CLOCK.instant().getEpochSecond();
    private static KeyPair keys;

    @BeforeAll
    static void keys() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
    }

    private GcpWorkerTokenVerifier adapter() {
        // The real SDK verifies signatures against this ephemeral test public
        // key, so no certificate endpoint or live credentials are contacted.
        TokenVerifier verifier = TokenVerifier.newBuilder().setPublicKey(keys.getPublic())
                .setAudience(WORKER).setIssuer("https://accounts.google.com")
                .setClock(CLOCK::millis).build();
        return new GcpWorkerTokenVerifier(WORKER, SERVICE_ACCOUNT, verifier, CLOCK);
    }

    private JsonWebToken.Payload claims() {
        return new JsonWebToken.Payload().setIssuer("https://accounts.google.com").setAudience(WORKER)
                .setIssuedAtTimeSeconds(NOW - 5).setExpirationTimeSeconds(NOW + 3595)
                .setSubject("123456789012345678901").set("email", SERVICE_ACCOUNT).set("email_verified", true);
    }

    private String sign(JsonWebToken.Payload claims) throws Exception {
        return JsonWebSignature.signUsingRsaSha256((RSAPrivateKey) keys.getPrivate(), GsonFactory.getDefaultInstance(),
                new JsonWebSignature.Header().setAlgorithm("RS256").setType("JWT").setKeyId("ephemeral-test-key"), claims);
    }

    @Test
    void acceptsAGenuinelySignedTokenForTheExpectedAudienceAndVerifiedIdentity() throws Exception {
        assertTrue(adapter().verify(sign(claims())));
    }

    @Test
    void rejectsTamperedSignaturesWrongAudienceAndWrongIssuer() throws Exception {
        String token = sign(claims());
        int signatureStart = token.lastIndexOf('.') + 1;
        String tampered = token.substring(0, signatureStart) +
                (token.charAt(signatureStart) == 'A' ? 'B' : 'A') + token.substring(signatureStart + 1);
        assertFalse(adapter().verify(tampered));
        assertFalse(adapter().verify(sign(claims().setAudience("https://other-worker.run.app"))));
        assertFalse(adapter().verify(sign(claims().setIssuer("https://untrusted.example"))));
    }

    @Test
    void rejectsOtherIdentitiesUnverifiedEmailsAndNonServiceAccountSubjects() throws Exception {
        assertFalse(adapter().verify(sign(claims().set("email", "other@test-project.iam.gserviceaccount.com"))));
        assertFalse(adapter().verify(sign(claims().set("email_verified", false))));
        assertFalse(adapter().verify(sign(claims().set("email_verified", "true"))));
        assertFalse(adapter().verify(sign(claims().setSubject("not-a-service-account-id"))));
    }

    @Test
    void requiresIssuedAtAndExpiryAndRejectsExpiredFutureAndOverlongTokens() throws Exception {
        assertFalse(adapter().verify(sign(claims().setIssuedAtTimeSeconds(null))));
        assertFalse(adapter().verify(sign(claims().setExpirationTimeSeconds(null))));
        assertFalse(adapter().verify(sign(claims().setExpirationTimeSeconds(NOW))));
        assertFalse(adapter().verify(sign(claims().setIssuedAtTimeSeconds(NOW + 61))));
        assertFalse(adapter().verify(sign(claims().setExpirationTimeSeconds(NOW + 7200))));
        assertFalse(adapter().verify(sign(claims().setIssuedAtTimeSeconds(NOW - 7200))));
    }

    @Test
    void blankBootstrapAudienceAndMalformedInputFailClosedBeforeVerification() {
        TokenVerifier verifier = mock(TokenVerifier.class);
        GcpWorkerTokenVerifier bootstrap = new GcpWorkerTokenVerifier("", SERVICE_ACCOUNT, verifier, CLOCK);
        assertFalse(bootstrap.verify("a.b.c"));
        GcpWorkerTokenVerifier ready = new GcpWorkerTokenVerifier(WORKER, SERVICE_ACCOUNT, verifier, CLOCK);
        assertFalse(ready.verify(null));
        for (String value : List.of("", "Bearer a.b.c", "a.b", "a.b.c.d", "a.b.c\n", "a".repeat(16_385))) {
            assertFalse(ready.verify(value));
        }
        verifyNoInteractions(verifier);
        assertFalse(adapter().verify("a.b.c"));
    }

    @Test
    void certificateVerificationFailuresDoNotLeakOrAuthorize() throws Exception {
        TokenVerifier verifier = mock(TokenVerifier.class);
        when(verifier.verify("a.b.c")).thenThrow(new TokenVerifier.VerificationException("secret-token"));
        assertFalse(new GcpWorkerTokenVerifier(WORKER, SERVICE_ACCOUNT, verifier, CLOCK).verify("a.b.c"));
    }

    @Test
    void arbitraryWorkerOriginsAndInvalidDispatchIdentitiesAreRejected() {
        for (String origin : List.of("http://worker.run.app", "https://example.com", WORKER + "/path",
                WORKER + "?value=x", WORKER + "#fragment", "https://user@worker.run.app")) {
            assertThrows(IllegalArgumentException.class, () -> new GcpWorkerTokenVerifier(origin, SERVICE_ACCOUNT));
        }
        assertThrows(IllegalArgumentException.class, () -> new GcpWorkerTokenVerifier(WORKER, "user@gmail.com"));
    }
}
