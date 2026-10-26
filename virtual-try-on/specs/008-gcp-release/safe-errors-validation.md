# Safe failures and bounded deletion verification

The shared failure helper accepts an enum category and optional opaque job UUID. It emits a constant message with `vw_failure=true` and a stable code; callers cannot supply a throwable, contact value, storage key, capability URL or response body. Worker/provider and catalog cleanup failures use that interface. Unexpected controller exceptions produce a generic no-store problem response. Framework client errors preserve their status without echoing binding/parser details or being misclassified as server incidents.

Four controlled HTTP/logging checks passed in the final 178-test backend suite. They inject private-looking exception/cause/parser content, verify response/log exclusion and absent throwable proxies, preserve 400/404/405 behavior, and check the structured boolean/code/UUID fields. These tests make no cloud or provider calls.

Deletion draining uses a nonblocking per-process permit and a two-second monotonic budget for starting operations. An overlapping request returns without starting another drain; an in-flight storage attempt finishes under the existing SDK settings, then metadata accounting completes. Remaining durable rows stay eligible for future maintenance. The permit releases even when database accounting fails. This bounds amplification across API and cron calls; it does not promise that a complete API request or storage attempt finishes in two seconds.

Three controlled storage/concurrency checks passed: overlap starts no duplicate drain, a 2.1-second first operation prevents starting the remaining batch, and a database failure releases the permit for retry. Final full backend evidence: 178 tests across 19 reports, zero failures/errors/skips, 1m46s in the 1 GiB / 70% heap profile; package and readiness passed. The catalog/private reference and dataset lifecycle protections are documented in [catalog-validation.md](catalog-validation.md).

Actual Cloud Logging ingestion, metrics/incidents, hosted operations and the independent human saree review require their own evidence. No hosted success or quality approval is inferred from these local checks.
