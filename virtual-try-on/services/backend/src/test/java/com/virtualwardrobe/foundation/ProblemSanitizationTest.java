package com.virtualwardrobe.foundation;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.virtualwardrobe.identity.ApiProblem;
import com.virtualwardrobe.identity.ProblemAdvice;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProblemSanitizationTest {
    private static final String PRIVATE = "private-photo-bytes phone=+919999999999 password=hidden signed-url-token=hidden";
    private final Logger logger = (Logger) LoggerFactory.getLogger(SafeFailures.LOGGER_NAME);
    private ListAppender<ILoggingEvent> events;
    private Level previousLevel;
    private boolean previousAdditive;
    private MockMvc mvc;

    @RestController
    static class Faults {
        @GetMapping("/unexpected") void unexpected() { throw new IllegalStateException(PRIVATE); }
        @GetMapping("/storage") void storage() {
            var problem = new ApiProblem(503, "STORAGE_UNAVAILABLE", "Photo storage is temporarily unavailable");
            problem.initCause(new IOException(PRIVATE));
            throw problem;
        }
        @GetMapping("/client-error") void clientError() { throw new ResponseStatusException(HttpStatus.NOT_FOUND, PRIVATE); }
        @PostMapping("/parse") Map<String, Object> parse(@RequestBody Map<String, Object> body) { return body; }
    }

    @BeforeEach void setup() {
        previousLevel = logger.getLevel(); previousAdditive = logger.isAdditive();
        logger.setLevel(Level.ERROR); logger.setAdditive(false);
        events = new ListAppender<>(); events.setContext(logger.getLoggerContext()); events.start();
        logger.addAppender(events);
        mvc = MockMvcBuilders.standaloneSetup(new Faults()).setControllerAdvice(new ProblemAdvice()).build();
    }

    @AfterEach void cleanup() {
        logger.detachAppender(events); events.stop();
        logger.setLevel(previousLevel); logger.setAdditive(previousAdditive);
    }

    private Map<String, Object> fields(ILoggingEvent event) {
        var fields = new HashMap<String, Object>();
        event.getKeyValuePairs().forEach(pair -> fields.put(pair.key, pair.value));
        assertThat(event.getFormattedMessage()).isEqualTo("VirtualWardrobe operation failed");
        assertThat(event.getThrowableProxy()).isNull();
        assertThat(fields.toString()).doesNotContain(PRIVATE, "password=", "signed-url-token=");
        return fields;
    }

    @Test void unexpectedDependencyDetailsNeverReachTheResponseOrFailureEvent() throws Exception {
        String body = mvc.perform(get("/unexpected")).andExpect(status().isInternalServerError())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(PRIVATE, "private-photo-bytes", "password=", "signed-url-token=");
        assertThat(events.list).hasSize(1);
        assertThat(fields(events.list.getFirst())).containsEntry("vw_failure", true)
                .containsEntry("code", "UNEXPECTED_REQUEST");
    }

    @Test void controlledDependencyFailureLogsOnlyItsAllowlistedCategory() throws Exception {
        mvc.perform(get("/storage")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Photo storage is temporarily unavailable"));
        assertThat(events.list).hasSize(1);
        assertThat(fields(events.list.getFirst())).containsEntry("code", "DEPENDENCY_UNAVAILABLE");
    }

    @Test void malformedAndFrameworkClientErrorsKeepClientStatusWithoutLoggingPayloads() throws Exception {
        String malformed = mvc.perform(post("/parse").contentType("application/json").content("{invalid " + PRIVATE))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andReturn().getResponse().getContentAsString();
        String missing = mvc.perform(get("/client-error")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("REQUEST_REJECTED"))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post("/unexpected")).andExpect(status().isMethodNotAllowed())
                .andExpect(header().exists("Allow"));
        assertThat(malformed + missing).doesNotContain(PRIVATE, "private-photo-bytes", "password=");
        assertThat(events.list).isEmpty();
    }

    @Test void optionalJobIdentifierIsAnOpaqueUuidAndNoThrowableIsAccepted() {
        UUID job = UUID.randomUUID();
        SafeFailures.record(SafeFailures.Code.WORKER_EXECUTION_FAILURE, job);
        assertThat(fields(events.list.getFirst())).containsEntry("job_id", job.toString())
                .containsEntry("code", "WORKER_EXECUTION_FAILURE").containsEntry("vw_failure", true);
    }
}
