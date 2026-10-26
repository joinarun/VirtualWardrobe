package com.virtualwardrobe.worker;

import com.google.api.client.json.webtoken.JsonWebSignature;
import com.google.auth.oauth2.TokenVerifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Clock;
import java.util.Objects;

/** Google signature verification supplements the worker's Cloud Run IAM boundary. */
@Component
@ConditionalOnProperty(name = "app.adapter-mode", havingValue = "gcp")
public final class GcpWorkerTokenVerifier implements WorkerTokenVerifier {
    private static final String ISSUER = "https://accounts.google.com";
    private final TokenVerifier verifier;
    private final String audience;
    private final String serviceAccount;
    private final Clock clock;

    @Autowired
    public GcpWorkerTokenVerifier(
            @Value("${APP_WORKER_URL:}") String workerUrl,
            @Value("${APP_TASKS_SERVICE_ACCOUNT:}") String serviceAccount) {
        this(workerUrl, serviceAccount, null, Clock.systemUTC());
    }

    GcpWorkerTokenVerifier(String workerUrl, String serviceAccount, TokenVerifier suppliedVerifier, Clock clock) {
        this.audience = canonicalWorkerUrl(workerUrl);
        if (serviceAccount == null ||
                !serviceAccount.matches("[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\\.iam\\.gserviceaccount\\.com")) {
            throw new IllegalArgumentException("The worker dispatch identity must be configured");
        }
        this.serviceAccount = serviceAccount;
        this.clock = Objects.requireNonNull(clock);
        this.verifier = suppliedVerifier != null ? suppliedVerifier : TokenVerifier.newBuilder()
                .setAudience(audience).setIssuer(ISSUER).build();
    }

    @Override
    public boolean verify(String bearerToken) {
        // Cloud Run passes the original standard Authorization token. Do not use
        // X-Serverless-Authorization, whose signature is removed by Cloud Run.
        if (audience.isEmpty() || bearerToken == null || bearerToken.length() > 16_384 ||
                !bearerToken.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) return false;
        try {
            JsonWebSignature jwt = verifier.verify(bearerToken);
            JsonWebSignature.Payload claims = jwt.getPayload();
            Long issuedAt = claims.getIssuedAtTimeSeconds();
            Long expiresAt = claims.getExpirationTimeSeconds();
            long now = clock.instant().getEpochSecond();
            return "RS256".equals(jwt.getHeader().getAlgorithm()) &&
                    ISSUER.equals(claims.getIssuer()) && audience.equals(claims.getAudience()) &&
                    serviceAccount.equals(claims.get("email")) && Boolean.TRUE.equals(claims.get("email_verified")) &&
                    claims.getSubject() != null && claims.getSubject().matches("[0-9]{10,30}") &&
                    issuedAt != null && expiresAt != null && issuedAt <= now + 60 &&
                    expiresAt > now && expiresAt > issuedAt && expiresAt - issuedAt <= 3660 &&
                    expiresAt <= now + 3660;
        } catch (TokenVerifier.VerificationException | RuntimeException invalid) {
            // No token, claim, request URL or certificate-fetch error is logged.
            return false;
        }
    }

    private static String canonicalWorkerUrl(String value) {
        // Initial worker revision must boot before its canonical URL is known;
        // it authorizes no internal request until the next configured revision.
        if (value == null || value.isEmpty()) return "";
        try {
            URI url = URI.create(value);
            if (!"https".equals(url.getScheme()) || url.getHost() == null ||
                    !url.getHost().matches("[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.run\\.app") ||
                    url.getPort() != -1 || url.getRawUserInfo() != null ||
                    url.getRawQuery() != null || url.getRawFragment() != null ||
                    !(url.getRawPath().isEmpty() || "/".equals(url.getRawPath()))) {
                throw new IllegalArgumentException();
            }
            return "https://" + url.getHost();
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("A canonical Cloud Run worker URL must be configured");
        }
    }
}
