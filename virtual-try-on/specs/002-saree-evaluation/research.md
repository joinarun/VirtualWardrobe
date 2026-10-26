# Saree provider research

- Decision: use Google generateContent REST through Java HttpClient with Google Auth Library 1.54.0, matching the project's Java baseline. Official auth artifact version verified at https://central.sonatype.com/artifact/com.google.auth/google-auth-library-oauth2-http.
- Google inference schema: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference . Credentials stay on the server; the endpoint uses a validated project/model/location and cloud-platform scope.
- Candidate model: gemini-nano-banana-2.1, location global. Parent executed one successful synthetic connectivity request in virtualtryon-511016: 32.39 seconds, approximately US$0.0403965 from reported usage. It is not a saree quality result.
- Observed behavior: response may contain thought=true image parts preceding the final non-thought image. Adapter must ignore all thought parts and select the final non-thought inline image.
- Alternative rejected: separate Python service adds deployment/credential boundaries without feature value. Full Google SDK is unnecessary for one supported REST call; official Java authentication is retained.
- Human review cannot be inferred from a generated image, a mock fixture or automated connectivity success. All evaluator reports stay HUMAN_REVIEW_PENDING until independent scoring is supplied and reviewed.
- Generation requests explicitly set candidateCount=1, maxOutputTokens=2048 and imageConfig.imageSize=1K with PNG output. Image configuration is documented at https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images ; changing resolution/model requires revalidating budget rates and request limits.
