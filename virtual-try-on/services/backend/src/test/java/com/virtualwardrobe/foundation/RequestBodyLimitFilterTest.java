package com.virtualwardrobe.foundation;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.annotation.Order;
import org.springframework.mock.web.*;
import org.springframework.stereotype.Component;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RequestBodyLimitFilterTest {
    private final RequestBodyLimitFilter filter = new RequestBodyLimitFilter();
    private static final String RAW_ID = "e452d346-7902-4cfa-a7d3-232fd0c0ec22";

    private MockHttpServletRequest request(String method, String path, byte[] body) {
        var request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        request.setContentType("application/json");
        request.setContent(body);
        return request;
    }
    private void rejected(MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> fail("Oversized request reached the application"));
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getContentAsString()).contains("REQUEST_BODY_TOO_LARGE").doesNotContain("private body");
    }

    @ParameterizedTest @ValueSource(strings = {"POST", "PUT", "PATCH", "DELETE"})
    void excessiveDeclaredLengthIsRejectedBeforeReadingAnyBody(String method) throws Exception {
        var request = new MockHttpServletRequest(method, "/api/v1/test") {
            @Override public long getContentLengthLong() { return RequestBodyLimitFilter.MAX_BODY_BYTES + 1; }
            @Override public ServletInputStream getInputStream() { throw new AssertionError("Declared oversized body was read"); }
        };
        request.setServletPath("/api/v1/test");
        rejected(request);
    }

    @Test void unknownLengthIsBoundedByActualBytesRegardlessOfContentType() throws Exception {
        var reads = new AtomicInteger();
        var bytes = new ByteArrayInputStream(new byte[RequestBodyLimitFilter.MAX_BODY_BYTES * 2]);
        var input = new ServletInputStream() {
            @Override public int read() { int value = bytes.read(); if (value >= 0) reads.incrementAndGet(); return value; }
            @Override public int read(byte[] target, int offset, int length) {
                int count = bytes.read(target, offset, length); if (count > 0) reads.addAndGet(count); return count;
            }
            @Override public boolean isFinished() { return bytes.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
        };
        var request = new MockHttpServletRequest("POST", "/internal/maintenance") {
            @Override public long getContentLengthLong() { return -1; }
            @Override public int getContentLength() { return -1; }
            @Override public ServletInputStream getInputStream() { return input; }
        };
        request.setServletPath("/internal/maintenance");
        request.setContentType("application/vnd.virtualwardrobe+json; charset=UTF-16");
        rejected(request);
        assertThat(reads.get()).isEqualTo(RequestBodyLimitFilter.MAX_BODY_BYTES + 1);
    }

    @Test void normalJsonStillReachesJacksonWithItsCharsetAndBodyIntact() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new Echo()).addFilters(filter).build();
        mvc.perform(post("/api/v1/echo").contentType("application/vnd.virtualwardrobe+json; charset=UTF-16")
                        .content("{\"text\":\"Saree साड़ी\"}".getBytes(StandardCharsets.UTF_16)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.text").value("Saree साड़ी"));
    }
    @RestController static class Echo {
        @PostMapping("/api/v1/echo") public Map<String, Object> echo(@RequestBody Map<String, Object> body) { return body; }
    }

    @Test void exactBoundaryIsAcceptedAndTheBufferedBodyRemainsReadable() throws Exception {
        byte[] body = new byte[RequestBodyLimitFilter.MAX_BODY_BYTES];
        body[body.length - 1] = 42;
        var request = request("PATCH", "/api/v1/test", body);
        var response = new MockHttpServletResponse();
        var reached = new AtomicInteger();
        filter.doFilter(request, response, (wrapped, ignored) -> {
            reached.incrementAndGet();
            assertThat(wrapped.getContentLengthLong()).isEqualTo(body.length);
            assertThat(wrapped.getInputStream().readAllBytes()).containsExactly(body);
        });
        assertThat(reached.get()).isEqualTo(1);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @ParameterizedTest @ValueSource(strings = {"uploads", "private-uploads"})
    void canonicalRawUploadPutRetainsItsIndependentLargerMediaLimit(String route) throws Exception {
        var request = request("PUT", "/api/v1/" + route + "/" + RAW_ID + "/content",
                new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]);
        var reached = new AtomicInteger();
        filter.doFilter(request, new MockHttpServletResponse(), (original, ignored) -> {
            reached.incrementAndGet();
            assertThat(original).isSameAs(request);
            assertThat(original.getInputStream().readAllBytes()).hasSize(RequestBodyLimitFilter.MAX_BODY_BYTES + 1);
        });
        assertThat(reached.get()).isEqualTo(1);
    }

    @Test void rawUploadExceptionIsLimitedToCanonicalPutRoutes() throws Exception {
        for (String path : new String[]{"/api/v1/uploads/" + RAW_ID + "/content", "/api/v1/uploads/not-a-uuid/content"})
            rejected(request("POST", path, new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]));
        rejected(request("PUT", "/api/v1/uploads/not-a-uuid/content", new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]));
    }

    @Test void decodedServletPathAndApplicationContextDetermineTheBoundary() throws Exception {
        var encoded = request("POST", "/ap%69/v1/test", new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]);
        encoded.setServletPath("/api/v1/test");
        rejected(encoded);
        var context = request("DELETE", "/shop/api/v1/test", new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]);
        context.setContextPath("/shop");
        context.setServletPath("/api/v1/test");
        rejected(context);
    }

    @Test void readsAndUnrelatedPathsAreUnchanged() throws Exception {
        for (var request : new MockHttpServletRequest[]{
                request("GET", "/api/v1/test", new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1]),
                request("POST", "/unrelated", new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1])}) {
            var reached = new AtomicInteger();
            filter.doFilter(request, new MockHttpServletResponse(), (original, ignored) -> {
                reached.incrementAndGet(); assertThat(original).isSameAs(request);
            });
            assertThat(reached.get()).isEqualTo(1);
        }
        assertThat(RequestBodyLimitFilter.class.isAnnotationPresent(Component.class)).isTrue();
        assertThat(RequestBodyLimitFilter.class.getAnnotation(Order.class).value()).isLessThan(-100);
    }

    @Test void actualChunkedHttpWithEncodedApiPrefixIsRejectedBeforeItsServlet(@TempDir Path directory) throws Exception {
        var visits = new AtomicInteger();
        var tomcat = new Tomcat();
        tomcat.setBaseDir(directory.toString());
        tomcat.setHostname("127.0.0.1");
        tomcat.setPort(0);
        tomcat.getConnector().setProperty("address", "127.0.0.1");
        var context = tomcat.addContext("", directory.toString());
        Tomcat.addServlet(context, "echo", new HttpServlet() {
            @Override protected void service(HttpServletRequest request, HttpServletResponse response) throws IOException {
                visits.incrementAndGet(); response.getWriter().write(Integer.toString(request.getInputStream().readAllBytes().length));
            }
        });
        context.addServletMappingDecoded("/", "echo");
        var definition = new FilterDef(); definition.setFilterName("bodyLimit"); definition.setFilter(new RequestBodyLimitFilter());
        context.addFilterDef(definition);
        var mapping = new FilterMap(); mapping.setFilterName("bodyLimit"); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
        try {
            tomcat.start();
            try (var client = HttpClient.newHttpClient()) {
                var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + tomcat.getConnector().getLocalPort() + "/ap%69/v1/echo"))
                        .version(HttpClient.Version.HTTP_1_1).timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/vnd.virtualwardrobe+json")
                        .POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(new byte[RequestBodyLimitFilter.MAX_BODY_BYTES + 1])))
                        .build();
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(413);
                assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
                assertThat(visits.get()).isZero();
            }
        } finally { tomcat.stop(); tomcat.destroy(); }
    }
}
