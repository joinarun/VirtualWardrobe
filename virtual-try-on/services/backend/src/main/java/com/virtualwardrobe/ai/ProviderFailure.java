package com.virtualwardrobe.ai;

public final class ProviderFailure extends RuntimeException {
    public enum Kind { RETRYABLE, REJECTED, INVALID_RESPONSE, UNKNOWN_OUTCOME, CONFIGURATION }
    private final Kind kind;
    public ProviderFailure(Kind kind, String safeMessage) { super(safeMessage); this.kind = kind; }
    public Kind kind() { return kind; }
}
