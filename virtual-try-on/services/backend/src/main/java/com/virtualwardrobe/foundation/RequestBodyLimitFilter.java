package com.virtualwardrobe.foundation;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

/**
 * Control requests are capped at 128 KiB before JSON parsing or controller validation.
 * Raw media PUTs retain their separate byte limits and concurrency controls.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public final class RequestBodyLimitFilter extends OncePerRequestFilter {
    static final int MAX_BODY_BYTES = 128 * 1024;
    private static final Set<String> MUTATIONS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Pattern RAW_UPLOAD = Pattern.compile(
            "/api/v1/(?:private-)?uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/content");

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        if (request.getPathInfo() != null) path += request.getPathInfo();
        if (path.isEmpty()) path = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        return !MUTATIONS.contains(request.getMethod()) ||
                !(path.startsWith("/api/v1/") || path.startsWith("/internal/")) ||
                (request.getMethod().equals("PUT") && RAW_UPLOAD.matcher(path).matches());
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                            FilterChain chain) throws ServletException, IOException {
        if (request.getContentLengthLong() > MAX_BODY_BYTES) {
            reject(response);
            return;
        }
        // Enforce actual bytes too: chunked/unknown lengths and declared lengths are untrusted.
        ServletInputStream input = request.getInputStream();
        byte[] body = new byte[MAX_BODY_BYTES];
        int length = input.readNBytes(body, 0, body.length);
        if (input.read() != -1) {
            reject(response);
            return;
        }
        chain.doFilter(new BoundedRequest(request, body, length), response);
    }

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"REQUEST_BODY_TOO_LARGE\",\"status\":413,\"code\":\"REQUEST_BODY_TOO_LARGE\",\"detail\":\"Control request bodies must not exceed 128 KiB\"}");
    }

    private static final class BoundedRequest extends HttpServletRequestWrapper {
        private final int length;
        private final ServletInputStream input;
        BoundedRequest(HttpServletRequest request, byte[] body, int length) {
            super(request);
            this.length = length;
            this.input = new ServletInputStream() {
                private final ByteArrayInputStream bytes = new ByteArrayInputStream(body, 0, length);
                @Override public int read() { return bytes.read(); }
                @Override public int read(byte[] target, int offset, int length) { return bytes.read(target, offset, length); }
                @Override public boolean isFinished() { return bytes.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    if (listener == null) throw new IllegalArgumentException("A read listener is required");
                    try {
                        if (!isFinished()) listener.onDataAvailable();
                        if (isFinished()) listener.onAllDataRead();
                    } catch (IOException failure) { listener.onError(failure); }
                }
            };
        }
        @Override public ServletInputStream getInputStream() { return input; }
        @Override public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            return new BufferedReader(new InputStreamReader(input,
                    encoding == null ? StandardCharsets.UTF_8.name() : encoding));
        }
        @Override public int getContentLength() { return length; }
        @Override public long getContentLengthLong() { return length; }
    }
}
