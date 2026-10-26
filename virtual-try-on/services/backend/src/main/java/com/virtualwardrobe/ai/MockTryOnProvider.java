package com.virtualwardrobe.ai;

import java.math.BigDecimal;

/** Deterministic fixture: never presented as an actual try-on. */
public final class MockTryOnProvider implements ImageProvider {
    @Override public GenerationResult generate(GenerationRequest request) {
        return new GenerationResult(request.garment(), request.garmentMimeType(), "mock", "fixture-v1", true, BigDecimal.ZERO, 0, 0, 0);
    }
}
