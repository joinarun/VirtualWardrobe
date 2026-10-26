package com.virtualwardrobe.ai;

import com.google.gson.*;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class GoogleImageProviderTest {
    private static final class ResponseServer implements AutoCloseable {
        private final HttpServer server;
        private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        ResponseServer(HttpHandler handler) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/generate", handler);
            server.setExecutor(executor);
            server.start();
        }
        HttpRequest request() {
            return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate"))
                    .timeout(Duration.ofSeconds(10)).POST(HttpRequest.BodyPublishers.ofString("{}")).build();
        }
        @Override public void close() { server.stop(0); executor.shutdownNow(); }
    }
    private GoogleImageProvider provider(int timeoutSeconds) {
        return new GoogleImageProvider(new AiProperties("test-project", "global", "test-model", timeoutSeconds));
    }
    static byte[] image(int rgb) throws Exception {
        var image=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB); image.setRGB(0,0,rgb);
        var out=new ByteArrayOutputStream(); ImageIO.write(image,"png",out); return out.toByteArray();
    }
    private JsonObject part(byte[] bytes, boolean thought) {
        var data=new JsonObject();data.addProperty("mimeType","image/png");data.addProperty("data",Base64.getEncoder().encodeToString(bytes));
        var p=new JsonObject();p.add("inlineData",data);p.addProperty("thought",thought);return p;
    }
    @Test void selectsFinalNonThoughtImage() throws Exception {
        var parts=new JsonArray();parts.add(part(image(0xFF0000),true));parts.add(part(image(0x00FF00),false));parts.add(part(image(0x0000FF),true));
        var content=new JsonObject();content.add("parts",parts);var candidate=new JsonObject();candidate.add("content",content);
        var candidates=new JsonArray();candidates.add(candidate);var root=new JsonObject();root.add("candidates",candidates);
        var result=GoogleImageProvider.parseResponse(root.toString(),"test-model");
        assertThat(result.image()).containsExactly(image(0x00FF00));assertThat(result.demo()).isFalse();
    }
    @Test void rejectsOnlyThoughtImage() throws Exception {
        var parts=new JsonArray();parts.add(part(image(1),true));
        var content=new JsonObject();content.add("parts",parts);var candidate=new JsonObject();candidate.add("content",content);
        var cs=new JsonArray();cs.add(candidate);var root=new JsonObject();root.add("candidates",cs);
        assertThatThrownBy(()->GoogleImageProvider.parseResponse(root.toString(),"m")).isInstanceOf(ProviderFailure.class).hasMessage("Provider returned no final image");
    }
    @Test void malformedBytesAndRawProviderContentAreNotExposed() {
        assertThatThrownBy(()->GoogleImageProvider.parseResponse("private raw content", "m"))
            .isInstanceOf(ProviderFailure.class).hasMessage("Provider returned an invalid final image");
    }
    @Test void mockAlwaysLabelsItself() throws Exception {
        var bytes=image(3);var result=new MockTryOnProvider().generate(new GenerationRequest(bytes,"image/png",bytes,"image/png"));
        assertThat(result.demo()).isTrue();assertThat(result.label()).isEqualTo("Demo preview");assertThat(result.estimatedCostUsd()).isZero();
    }
    @Test void deadlineIncludesBodyStalledAfterResponseHeaders() throws Exception {
        var headersSent = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var server = new ResponseServer(exchange -> {
            try {
                exchange.sendResponseHeaders(200, 100);
                exchange.getResponseBody().write('{');
                exchange.getResponseBody().flush();
                headersSent.countDown();
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally { exchange.close(); }
        })) {
            var provider = provider(1);
            long start = System.nanoTime();
            assertThatThrownBy(() -> provider.generateResponse(server.request()))
                    .isInstanceOfSatisfying(ProviderFailure.class, failure ->
                            assertThat(failure.kind()).isEqualTo(ProviderFailure.Kind.UNKNOWN_OUTCOME))
                    .hasMessage("Provider outcome is unknown after timeout; do not automatically retry");
            assertThat(headersSent.getCount()).isZero();
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(3));
        } finally { release.countDown(); }
    }
    @Test void streamingResponseIsRejectedAtTheByteCap() throws Exception {
        try (var server = new ResponseServer(exchange -> {
            try {
                exchange.sendResponseHeaders(200, 0); // No Content-Length: enforce the cap while consuming bytes.
                byte[] chunk = new byte[16 * 1024];
                for (int sent = 0; sent < 24 * 1024 * 1024; sent += chunk.length)
                    exchange.getResponseBody().write(chunk);
                exchange.getResponseBody().write(1);
            } catch (IOException cancelled) {
                // The capped subscriber cancels the connection once the body is too large.
            } finally { exchange.close(); }
        })) {
            assertThatThrownBy(() -> provider(5).generateResponse(server.request()))
                    .isInstanceOfSatisfying(ProviderFailure.class, failure ->
                            assertThat(failure.kind()).isEqualTo(ProviderFailure.Kind.INVALID_RESPONSE))
                    .hasMessage("Provider result exceeds size limit");
        }
    }
    @Test void completeHttpResponseReturnsTheFinalImage() throws Exception {
        byte[] expected = image(0x00FF00);
        var parts = new JsonArray(); parts.add(part(expected, false));
        var content = new JsonObject(); content.add("parts", parts);
        var candidate = new JsonObject(); candidate.add("content", content);
        var candidates = new JsonArray(); candidates.add(candidate);
        var root = new JsonObject(); root.add("candidates", candidates);
        byte[] response = root.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (var server = new ResponseServer(exchange -> {
            try {
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            } finally { exchange.close(); }
        })) {
            var result = provider(5).generateResponse(server.request());
            assertThat(result.image()).containsExactly(expected);
            assertThat(result.provider()).isEqualTo("google");
            assertThat(result.model()).isEqualTo("test-model");
            assertThat(result.demo()).isFalse();
        }
    }
}
