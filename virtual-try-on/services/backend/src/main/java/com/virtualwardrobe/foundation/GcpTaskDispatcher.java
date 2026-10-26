package com.virtualwardrobe.foundation;

import com.google.api.gax.rpc.AlreadyExistsException;
import com.google.cloud.tasks.v2.CloudTasksClient;
import com.google.cloud.tasks.v2.CloudTasksSettings;
import com.google.cloud.tasks.v2.CreateTaskRequest;
import com.google.cloud.tasks.v2.HttpMethod;
import com.google.cloud.tasks.v2.HttpRequest;
import com.google.cloud.tasks.v2.OidcToken;
import com.google.cloud.tasks.v2.QueueName;
import com.google.cloud.tasks.v2.Task;
import com.google.cloud.tasks.v2.TaskName;
import com.google.protobuf.ByteString;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Enqueues committed job IDs only; state, paid retries and queue configuration live elsewhere. */
@Component
@ConditionalOnProperty(name = "app.adapter-mode", havingValue = "gcp")
public final class GcpTaskDispatcher implements TaskDispatcher {
    public static final String SEQUENCE_HEADER = "X-VirtualWardrobe-Dispatch-Sequence";
    private final CloudTasksClient client;
    private final String project;
    private final String location;
    private final String queue;
    private final String queuePath;
    private final String serviceAccount;
    private final String workerUrl;

    @Autowired
    public GcpTaskDispatcher(
            @Value("${APP_GCP_PROJECT:${GOOGLE_CLOUD_PROJECT:}}") String project,
            @Value("${APP_TASKS_LOCATION:}") String location,
            @Value("${APP_TASKS_QUEUE:}") String queue,
            @Value("${APP_TASKS_SERVICE_ACCOUNT:}") String serviceAccount,
            @Value("${APP_WORKER_URL:}") String workerUrl,
            @Value("${app.mode:api}") String mode) throws IOException {
        this(null, project, location, queue, serviceAccount, workerUrl, mode);
    }

    GcpTaskDispatcher(CloudTasksClient suppliedClient, String project, String location, String queue,
                      String serviceAccount, String workerUrl, String mode) throws IOException {
        if (project == null || !project.matches("[a-z][a-z0-9-]{4,28}[a-z0-9]") ||
                location == null || !location.matches("[a-z]+(?:-[a-z]+)+[0-9]") ||
                queue == null || !queue.matches("[A-Za-z0-9-]{1,100}") ||
                serviceAccount == null || !serviceAccount.matches("[a-z][a-z0-9-]{4,28}[a-z0-9]@" +
                        java.util.regex.Pattern.quote(project) + "\\.iam\\.gserviceaccount\\.com") ||
                !("api".equals(mode) || "worker".equals(mode))) {
            throw new IllegalArgumentException("Cloud task queue and dispatch identity must be configured");
        }
        this.workerUrl = canonicalWorkerUrl(workerUrl, mode);
        this.project = project;
        this.location = location;
        this.queue = queue;
        this.queuePath = QueueName.of(project, location, queue).toString();
        this.serviceAccount = serviceAccount;
        this.client = suppliedClient == null ? CloudTasksClient.create(clientSettings()) : suppliedClient;
    }

    static CloudTasksSettings clientSettings() throws IOException {
        CloudTasksSettings.Builder settings = CloudTasksSettings.newBuilder();
        // The durable dispatch reconciler retries a failed enqueue with the same
        // name. Do not compound that policy with hidden SDK retries.
        settings.createTaskSettings().setRetryableCodes(Set.of()).setRetrySettings(
                settings.createTaskSettings().getRetrySettings().toBuilder()
                        .setMaxAttempts(1)
                        .setInitialRpcTimeoutDuration(Duration.ofSeconds(10))
                        .setMaxRpcTimeoutDuration(Duration.ofSeconds(10))
                        .setRpcTimeoutMultiplier(1.0)
                        .setTotalTimeoutDuration(Duration.ofSeconds(10)).build());
        return settings.build();
    }

    @Override
    public void dispatch(UUID jobId, int dispatchSequence) throws IOException {
        Objects.requireNonNull(jobId, "A job ID is required");
        if (dispatchSequence < 1) throw new IllegalArgumentException("A positive dispatch sequence is required");
        if (workerUrl.isEmpty()) throw new IOException("Cloud task dispatch is not configured");
        String name = TaskName.of(project, location, queue, jobId + "-" + dispatchSequence).toString();
        HttpRequest request = HttpRequest.newBuilder()
                .setHttpMethod(HttpMethod.POST)
                .setUrl(workerUrl + "/internal/jobs/" + jobId + "/run")
                .putHeaders("Content-Type", "application/json")
                .putHeaders(SEQUENCE_HEADER, Integer.toString(dispatchSequence))
                .setBody(ByteString.copyFromUtf8("{\"jobId\":\"" + jobId + "\"}"))
                .setOidcToken(OidcToken.newBuilder().setServiceAccountEmail(serviceAccount)
                        .setAudience(workerUrl)).build();
        Task task = Task.newBuilder().setName(name).setHttpRequest(request)
                .setDispatchDeadline(com.google.protobuf.Duration.newBuilder().setSeconds(180)).build();
        try {
            client.createTask(CreateTaskRequest.newBuilder().setParent(queuePath).setTask(task)
                    .setResponseView(Task.View.BASIC).build());
        } catch (AlreadyExistsException duplicate) {
            // A successful-but-unacknowledged create or repeated reconciliation
            // must not create another delivery. Worker DB claims remain required.
        } catch (RuntimeException unavailable) {
            // SDK exception text may contain request details. Never propagate it.
            throw new IOException("Cloud task dispatch is temporarily unavailable");
        }
    }

    private static String canonicalWorkerUrl(String value, String mode) {
        if ((value == null || value.isEmpty()) && "worker".equals(mode)) return "";
        try {
            URI url = URI.create(value == null ? "" : value);
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

    @PreDestroy
    public void close() { client.close(); }
}
