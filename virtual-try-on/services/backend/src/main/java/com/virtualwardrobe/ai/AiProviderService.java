package com.virtualwardrobe.ai;

import com.virtualwardrobe.foundation.FoundationProperties;
import org.springframework.stereotype.Service;

@Service
public class AiProviderService implements ImageProvider {
    private final ImageProvider delegate;
    public AiProviderService(FoundationProperties properties, AiProperties ai) {
        delegate = properties.imageProvider().equals("google") ? new GoogleImageProvider(ai) : new MockTryOnProvider();
    }
    @Override public GenerationResult generate(GenerationRequest request) { return delegate.generate(request); }
}
