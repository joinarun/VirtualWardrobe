package com.virtualwardrobe.foundation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class LocalTaskDispatcher implements TaskDispatcher {
    private final StorageAdapter storage;
    public LocalTaskDispatcher(StorageAdapter storage) { this.storage = storage; }
    public void dispatch(UUID jobId) throws IOException { storage.put("queue/" + jobId + ".task", jobId.toString().getBytes(StandardCharsets.UTF_8)); }
}
