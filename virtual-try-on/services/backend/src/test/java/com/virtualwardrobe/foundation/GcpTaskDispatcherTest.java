package com.virtualwardrobe.foundation;

import com.google.api.gax.rpc.AlreadyExistsException;
import com.google.cloud.tasks.v2.CloudTasksClient;
import com.google.cloud.tasks.v2.CreateTaskRequest;
import com.google.cloud.tasks.v2.HttpMethod;
import com.google.cloud.tasks.v2.Task;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GcpTaskDispatcherTest {
    private static final String PROJECT = "test-project";
    private static final String LOCATION = "asia-south1";
    private static final String QUEUE = "virtualwardrobe-demo-generations";
    private static final String SERVICE_ACCOUNT = "dispatch@test-project.iam.gserviceaccount.com";
    private static final String WORKER = "https://virtualwardrobe-worker-123.asia-south1.run.app";
    private static final UUID JOB = UUID.fromString("569938ea-b941-4b1d-9c0a-9ff1832f1571");

    private GcpTaskDispatcher adapter(CloudTasksClient client) throws IOException {
        return new GcpTaskDispatcher(client, PROJECT, LOCATION, QUEUE, SERVICE_ACCOUNT, WORKER, "api");
    }

    @Test
    void enqueuesOnlyJobIdentityWithExplicitQueueOidcAudienceAndDeadline() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        adapter(client).dispatch(JOB, 2);
        ArgumentCaptor<CreateTaskRequest> capture = ArgumentCaptor.forClass(CreateTaskRequest.class);
        verify(client).createTask(capture.capture());
        CreateTaskRequest request = capture.getValue();
        assertEquals("projects/test-project/locations/asia-south1/queues/" + QUEUE, request.getParent());
        assertEquals(request.getParent() + "/tasks/" + JOB + "-2", request.getTask().getName());
        assertEquals(Task.View.BASIC, request.getResponseView());
        var http = request.getTask().getHttpRequest();
        assertEquals(HttpMethod.POST, http.getHttpMethod());
        assertEquals(WORKER + "/internal/jobs/" + JOB + "/run", http.getUrl());
        assertEquals("{\"jobId\":\"" + JOB + "\"}", http.getBody().toStringUtf8());
        assertEquals("application/json", http.getHeadersOrThrow("Content-Type"));
        assertEquals("2", http.getHeadersOrThrow(GcpTaskDispatcher.SEQUENCE_HEADER));
        assertEquals(2, http.getHeadersCount());
        assertEquals(SERVICE_ACCOUNT, http.getOidcToken().getServiceAccountEmail());
        assertEquals(WORKER, http.getOidcToken().getAudience());
        assertFalse(http.hasOauthToken());
        assertEquals(180, request.getTask().getDispatchDeadline().getSeconds());
        verifyNoMoreInteractions(client);
    }

    @Test
    void repeatedDeliveryHasSameNameWhileNewSequenceHasDifferentName() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        GcpTaskDispatcher adapter = adapter(client);
        adapter.dispatch(JOB);
        adapter.dispatch(JOB, 1);
        adapter.dispatch(JOB, 2);
        ArgumentCaptor<CreateTaskRequest> capture = ArgumentCaptor.forClass(CreateTaskRequest.class);
        verify(client, times(3)).createTask(capture.capture());
        List<CreateTaskRequest> requests = capture.getAllValues();
        assertEquals(requests.get(0), requests.get(1));
        assertNotEquals(requests.get(0).getTask().getName(), requests.get(2).getTask().getName());
    }

    @Test
    void alreadyExistsAcknowledgesTheExistingDeliveryWithoutAnotherSdkCall() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        when(client.createTask(any(CreateTaskRequest.class))).thenThrow(mock(AlreadyExistsException.class));
        assertDoesNotThrow(() -> adapter(client).dispatch(JOB, 1));
        verify(client, times(1)).createTask(any(CreateTaskRequest.class));
        verifyNoMoreInteractions(client);
    }

    @Test
    void providerErrorsAreSanitizedAndLeftToDurableReconciliation() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        when(client.createTask(any(CreateTaskRequest.class)))
                .thenThrow(new IllegalStateException("secret-token and private-request-url"));
        IOException error = assertThrows(IOException.class, () -> adapter(client).dispatch(JOB, 1));
        assertEquals("Cloud task dispatch is temporarily unavailable", error.getMessage());
        assertNull(error.getCause());
        verify(client, times(1)).createTask(any(CreateTaskRequest.class));
    }

    @Test
    void invalidJobAndSequenceNeverReachCloudTasks() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        GcpTaskDispatcher adapter = adapter(client);
        assertThrows(NullPointerException.class, () -> adapter.dispatch(null, 1));
        assertThrows(IllegalArgumentException.class, () -> adapter.dispatch(JOB, 0));
        assertThrows(IllegalArgumentException.class, () -> adapter.dispatch(JOB, -1));
        verifyNoInteractions(client);
    }

    @Test
    void workerBootstrapAcceptsNoTargetButCannotDispatch() throws Exception {
        CloudTasksClient client = mock(CloudTasksClient.class);
        GcpTaskDispatcher adapter = new GcpTaskDispatcher(client, PROJECT, LOCATION, QUEUE,
                SERVICE_ACCOUNT, "", "worker");
        assertThrows(IOException.class, () -> adapter.dispatch(JOB, 1));
        assertThrows(IllegalArgumentException.class, () -> new GcpTaskDispatcher(client,
                PROJECT, LOCATION, QUEUE, SERVICE_ACCOUNT, "", "api"));
        verifyNoInteractions(client);
    }

    @Test
    void configurationCannotRouteJobsToAnArbitraryUrlOrAnotherProjectsIdentity() {
        CloudTasksClient client = mock(CloudTasksClient.class);
        for (String target : List.of("http://worker.run.app", "https://example.com", WORKER + "/path",
                WORKER + "?secret=value", WORKER + "#fragment", WORKER + ":443", "https://user@worker.run.app")) {
            assertThrows(IllegalArgumentException.class, () -> new GcpTaskDispatcher(client,
                    PROJECT, LOCATION, QUEUE, SERVICE_ACCOUNT, target, "api"));
        }
        assertThrows(IllegalArgumentException.class, () -> new GcpTaskDispatcher(client,
                PROJECT, LOCATION, QUEUE, "dispatch@other-project.iam.gserviceaccount.com", WORKER, "api"));
        assertThrows(IllegalArgumentException.class, () -> new GcpTaskDispatcher(client,
                PROJECT, LOCATION, "queue/path", SERVICE_ACCOUNT, WORKER, "api"));
        verifyNoInteractions(client);
    }

    @Test
    void sdkCreateCallHasOneAttemptAndTenSecondTimeoutAndClientIsClosed() throws Exception {
        var create = GcpTaskDispatcher.clientSettings().createTaskSettings();
        assertTrue(create.getRetryableCodes().isEmpty());
        assertEquals(1, create.getRetrySettings().getMaxAttempts());
        assertEquals(Duration.ofSeconds(10), create.getRetrySettings().getInitialRpcTimeoutDuration());
        assertEquals(Duration.ofSeconds(10), create.getRetrySettings().getMaxRpcTimeoutDuration());
        assertEquals(Duration.ofSeconds(10), create.getRetrySettings().getTotalTimeoutDuration());
        CloudTasksClient client = mock(CloudTasksClient.class);
        adapter(client).close();
        verify(client).close();
    }
}
