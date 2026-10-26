package com.virtualwardrobe.ai;

import java.math.BigDecimal;

public record GenerationResult(byte[] image, String mimeType, String provider, String model,
                               boolean demo, BigDecimal estimatedCostUsd, int inputTokens,
                               int outputTokens, int thoughtTokens) {
    public GenerationResult {
        ImageValidation.validate(image, mimeType);
        image = image.clone();
    }
    public String label() { return demo ? "Demo preview" : "AI-generated preview"; }
}
