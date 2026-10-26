# Image provider contract

`GenerationResult ImageProvider.generate(GenerationRequest request)` returns exactly one validated final image or a classified ProviderFailure. Types RETRYABLE, REJECTED, INVALID_RESPONSE, UNKNOWN_OUTCOME and CONFIGURATION describe safe job-layer handling. The adapter itself never retries. UNKNOWN_OUTCOME must not be automatically retried by later jobs.

Google provider chooses the final non-thought inlineData image. Mock provider returns a deterministic fixture and `demo=true`, provider=mock, cost=0, label Demo preview. Downstream durable jobs must persist state and quota before invoking this interface.

Environment: APP_IMAGE_PROVIDER=mock|google, APP_AI_PROJECT, APP_AI_LOCATION=global, APP_AI_MODEL=gemini-nano-banana-2.1, APP_AI_TIMEOUT_SECONDS=120. The benchmark is CLI-only and does not expose an anonymous paid-generation endpoint.
