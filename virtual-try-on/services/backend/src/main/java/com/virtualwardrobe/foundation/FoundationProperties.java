package com.virtualwardrobe.foundation;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record FoundationProperties(String mode, String adapterMode, String imageProvider) {
    public FoundationProperties {
        if (!"api".equals(mode) && !"worker".equals(mode)) throw new IllegalArgumentException("APP_MODE must be api or worker");
        if (!"local".equals(adapterMode)) throw new IllegalArgumentException("Foundation supports APP_ADAPTER_MODE=local only");
        if (!"mock".equals(imageProvider) && !"google".equals(imageProvider)) throw new IllegalArgumentException("APP_IMAGE_PROVIDER must be mock or google");
    }
}
