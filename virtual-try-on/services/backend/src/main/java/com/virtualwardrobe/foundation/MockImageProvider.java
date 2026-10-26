package com.virtualwardrobe.foundation;

import org.springframework.stereotype.Component;

@Component
public class MockImageProvider {
    public record Metadata(String provider, boolean demo, String label) {}
    public Metadata metadata() { return new Metadata("mock", true, "Demo preview"); }
}
