package com.virtualwardrobe.ai;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.gson.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;

/** Server-side provider; errors deliberately contain no raw response, token or image bytes. */
public final class GoogleImageProvider implements ImageProvider {
    private static final int MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
    private final AiProperties properties;
    private final HttpClient client;

    public GoogleImageProvider(AiProperties properties) {
        this.properties = properties;
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    @Override public GenerationResult generate(GenerationRequest request) {
        if (properties.project() == null || !properties.project().matches("[a-z][a-z0-9-]{4,61}[a-z0-9]"))
            throw new ProviderFailure(ProviderFailure.Kind.CONFIGURATION, "A valid AI project is required");
        String token;
        try {
            var credentials = GoogleCredentials.getApplicationDefault()
                    .createScoped(List.of("https://www.googleapis.com/auth/cloud-platform"));
            credentials.refreshIfExpired();
            token = credentials.getAccessToken().getTokenValue();
        } catch (IOException | RuntimeException e) {
            throw new ProviderFailure(ProviderFailure.Kind.CONFIGURATION, "Google application credentials are unavailable");
        }
        String host = properties.location().equals("global") ? "aiplatform.googleapis.com" : properties.location() + "-aiplatform.googleapis.com";
        URI endpoint = URI.create("https://" + host + "/v1/projects/" + properties.project() + "/locations/" + properties.location()
                + "/publishers/google/models/" + properties.model() + ":generateContent");
        var parts = new JsonArray();
        var text = new JsonObject();
        text.addProperty("text", "Create a virtual clothing try-on preview: dress the adult person in the first image in the exact saree or garment shown in the second. Preserve identity, body shape, garment pattern, colours, borders and drape. Return one natural full-body image. This is an illustrative AI preview, not a fit guarantee.");
        parts.add(text);
        parts.add(imagePart(request.person(), request.personMimeType()));
        parts.add(imagePart(request.garment(), request.garmentMimeType()));
        var content = new JsonObject(); content.addProperty("role", "user"); content.add("parts", parts);
        var contents = new JsonArray(); contents.add(content);
        var body = new JsonObject(); body.add("contents", contents);
        var config = new JsonObject(); var modalities = new JsonArray(); modalities.add("TEXT"); modalities.add("IMAGE");
        config.add("responseModalities", modalities);
        config.addProperty("candidateCount", 1);
        config.addProperty("maxOutputTokens", 2048);
        var imageConfig = new JsonObject(); imageConfig.addProperty("imageSize", "1K");
        var imageOutput = new JsonObject(); imageOutput.addProperty("mimeType", "image/png");
        imageConfig.add("imageOutputOptions", imageOutput); config.add("imageConfig", imageConfig);
        body.add("generationConfig", config);
        var httpRequest = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(properties.timeoutSeconds()))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
        try {
            var response = client.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
            byte[] responseBytes;
            try (var stream = response.body()) { responseBytes = stream.readNBytes(MAX_RESPONSE_BYTES + 1); }
            if (responseBytes.length > MAX_RESPONSE_BYTES)
                throw new ProviderFailure(ProviderFailure.Kind.INVALID_RESPONSE, "Provider result exceeds size limit");
            if (response.statusCode() == 429 || response.statusCode() == 503)
                throw new ProviderFailure(ProviderFailure.Kind.RETRYABLE, "Image provider is temporarily unavailable");
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw new ProviderFailure(ProviderFailure.Kind.REJECTED, "Image provider rejected this request");
            return parseResponse(new String(responseBytes, StandardCharsets.UTF_8), properties.model());
        } catch (HttpTimeoutException e) {
            throw new ProviderFailure(ProviderFailure.Kind.UNKNOWN_OUTCOME, "Provider outcome is unknown after timeout; do not automatically retry");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ProviderFailure(ProviderFailure.Kind.UNKNOWN_OUTCOME, "Provider request was interrupted; outcome requires review");
        } catch (IOException e) {
            throw new ProviderFailure(ProviderFailure.Kind.UNKNOWN_OUTCOME, "Provider connection ended without a confirmed outcome");
        }
    }

    private static JsonObject imagePart(byte[] bytes, String mime) {
        var data = new JsonObject(); data.addProperty("mimeType", mime); data.addProperty("data", Base64.getEncoder().encodeToString(bytes));
        var part = new JsonObject(); part.add("inlineData", data); return part;
    }

    public static GenerationResult parseResponse(String raw, String model) {
        try {
            JsonObject root = JsonParser.parseString(raw).getAsJsonObject();
            JsonObject selected = null;
            JsonArray candidates = root.getAsJsonArray("candidates");
            if (candidates != null) for (var candidate : candidates) {
                var c = candidate.getAsJsonObject();
                if (!c.has("content")) continue;
                var responseParts = c.getAsJsonObject("content").getAsJsonArray("parts");
                if (responseParts == null) continue;
                for (var value : responseParts) {
                    var part = value.getAsJsonObject();
                    if (part.has("thought") && part.get("thought").getAsBoolean()) continue;
                    if (part.has("inlineData")) selected = part.getAsJsonObject("inlineData");
                }
            }
            if (selected == null) throw new ProviderFailure(ProviderFailure.Kind.INVALID_RESPONSE, "Provider returned no final image");
            String mime = selected.get("mimeType").getAsString();
            byte[] bytes = Base64.getDecoder().decode(selected.get("data").getAsString());
            var usage = root.has("usageMetadata") ? root.getAsJsonObject("usageMetadata") : new JsonObject();
            int input = integer(usage,"promptTokenCount"), output = integer(usage,"candidatesTokenCount"), thought = integer(usage,"thoughtsTokenCount");
            // Default standard Nano Banana 2.1 rates; explicit overrides are required when changing model/rates.
            // All candidate output is charged at the image rate here, conservatively including any text.
            BigDecimal million = new BigDecimal("1000000");
            BigDecimal estimated = BigDecimal.valueOf(input).multiply(rate("APP_AI_INPUT_USD_PER_MILLION", "1.50")).divide(million)
                    .add(BigDecimal.valueOf(output).multiply(rate("APP_AI_OUTPUT_USD_PER_MILLION", "30.00")).divide(million))
                    .add(BigDecimal.valueOf(thought).multiply(rate("APP_AI_THOUGHT_USD_PER_MILLION", "7.50")).divide(million));
            return new GenerationResult(bytes, mime, "google", model, false, estimated, input, output, thought);
        } catch (ProviderFailure e) { throw e; }
        catch (RuntimeException e) { throw new ProviderFailure(ProviderFailure.Kind.INVALID_RESPONSE, "Provider returned an invalid final image"); }
    }
    private static int integer(JsonObject o, String key) { return o.has(key) ? Math.max(0,o.get(key).getAsInt()) : 0; }
    private static BigDecimal rate(String key, String fallback) {
        var result = new BigDecimal(System.getenv().getOrDefault(key, fallback));
        if (result.signum() < 0) throw new IllegalArgumentException("Invalid provider pricing configuration");
        return result;
    }
}
