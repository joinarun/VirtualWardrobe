package com.virtualwardrobe.foundation;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record FoundationProperties(String mode, String adapterMode, String imageProvider) {
    public FoundationProperties {
        if (!"api".equals(mode) && !"worker".equals(mode)) throw new IllegalArgumentException("APP_MODE must be api or worker");
        if (!"local".equals(adapterMode) && !"gcp".equals(adapterMode)) throw new IllegalArgumentException("APP_ADAPTER_MODE must be local or gcp");
        if (!"mock".equals(imageProvider) && !"google".equals(imageProvider)) throw new IllegalArgumentException("APP_IMAGE_PROVIDER must be mock or google");
    }
}
