package com.virtualwardrobe.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(String project, String location, String model, int timeoutSeconds) {
    public AiProperties {
        if (timeoutSeconds < 1 || timeoutSeconds > 180) throw new IllegalArgumentException("AI timeout must be 1–180 seconds");
        if (location == null || !location.matches("[a-z0-9-]+")) throw new IllegalArgumentException("Invalid AI location");
        if (model == null || !model.matches("[a-zA-Z0-9._-]+")) throw new IllegalArgumentException("Invalid AI model");
    }
}
