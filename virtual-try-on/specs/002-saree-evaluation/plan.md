# Implementation Plan Saree image evaluation

**Date**: 2026-10-26 · **Spec**: [spec.md](spec.md)

## Summary

Add a reusable Java image-provider interface and real Google REST adapter, plus a non-server evaluator CLI. Default mock evaluation copies a known synthetic fixture with honest demo metadata. Live evaluation uses workload/Application Default Credentials and an explicit spend allowance. No paid calls are part of automated tests.

## Technical Context

Java 21, existing Spring Boot 4.1.2 and Maven Wrapper; Java HttpClient and Google Auth Library 1.54.0; Gson provided with the auth library. Local ignored work files hold benchmark artifacts. JUnit validates parsing, input/provenance and budgets. Configured request deadline is 120 seconds, bounded image files are 10 MB and 20 megapixels, one output per request. Runs are sequential to limit spend and concurrency. No database schema changes are needed.

## Constitution Check

Pass before and after design: one backend codebase, backend-only credentials, explicit mock labels, source/licence/consent checks, bounded spend, no retries of ambiguous failures, no invented human review. This feature does not implement customer job persistence; feature 5 must wrap the provider in durable jobs. A full live launch remains gated by 40 reviewed pairs; fixture-mode demo is allowed with explicit labels.

## Project Structure

- services/backend/src/main/java/com/virtualwardrobe/ai/: ImageProvider, GenerationRequest/Result, ProviderFailure, GoogleImageProvider, MockTryOnProvider, AiProviderService, BenchmarkMain.
- services/backend/src/test/java/com/virtualwardrobe/ai/: parser, image/provenance/budget tests.
- scripts/ai-benchmark.sh and make ai-benchmark: CLI wrapper; no public endpoint.
- docs/evaluations/: aggregate connectivity evidence and benchmark instructions.
- work/ai-benchmark/: ignored results and human review sheet.

## Decisions and validation

Use authenticated Google generateContent REST with model/location/project validation, selecting the last supported inlineData part where thought is not true. Never expose raw provider response strings in errors. Validate decoded output images and bounded input pixel counts. Token acquisition is lazy so mock mode needs no credentials. Unit responses never make network calls. The existing authorized connectivity report is documented separately and is insufficient to pass the visual gate.

No constitution exceptions or new infrastructure are introduced.
