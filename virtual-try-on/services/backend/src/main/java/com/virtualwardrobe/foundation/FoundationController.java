package com.virtualwardrobe.foundation;

import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name = "app.mode", havingValue = "api", matchIfMissing = true)
public class FoundationController {
    private final FoundationProperties properties;
    private final MockImageProvider provider;
    public FoundationController(FoundationProperties properties, MockImageProvider provider) { this.properties = properties; this.provider = provider; }
    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "application", "Virtual Wardrobe", "version", "0.1.0", "executionMode", properties.mode(), "adapterMode", properties.adapterMode(), "imageProvider", properties.imageProvider());
    }
    @GetMapping("/api/v1/foundation/providers")
    public MockImageProvider.Metadata providers() { return provider.metadata(); }
}
