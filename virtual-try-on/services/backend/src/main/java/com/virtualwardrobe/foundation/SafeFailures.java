package com.virtualwardrobe.foundation;

import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Failure telemetry accepts only an allowlisted category and an opaque job identifier. */
public final class SafeFailures {
    static final String LOGGER_NAME = "com.virtualwardrobe.operations";
    private static final Logger LOG = LoggerFactory.getLogger(LOGGER_NAME);

    public enum Code {
        UNEXPECTED_REQUEST, DEPENDENCY_UNAVAILABLE, PROVIDER_TEMPORARY_FAILURE,
        PROVIDER_UNKNOWN_OUTCOME, PROVIDER_REJECTED, PROVIDER_RESPONSE_INVALID,
        PROVIDER_CONFIGURATION, WORKER_EXECUTION_FAILURE, WORKER_RESULT_STORAGE_FAILURE,
        CATALOG_CLEANUP_CONFLICT, CATALOG_CLEANUP_UNAVAILABLE, RELEASE_PROBE
    }

    private SafeFailures() { }

    public static void record(Code code) { record(code, null); }

    public static void record(Code code, UUID jobId) {
        var event = LOG.atError().addKeyValue("vw_failure", true)
                .addKeyValue("code", Objects.requireNonNull(code).name());
        if (jobId != null) event.addKeyValue("job_id", jobId.toString());
        event.log("VirtualWardrobe operation failed");
    }
}
