# Release decisions and current sources

Checked 2026-10-27. Existing actual provisioning/SDK/provider evidence is reused; no paid call was made for planning.

| Decision | Rationale and alternative considered |
| --- | --- |
| Keep PG17 and the existing CloudSQL connector | Current [Cloud SQL version policy](https://docs.cloud.google.com/sql/docs/postgres/db-versions) supports PG17; local transactional tests already use it. No database migration to another service. |
| Keep Nano Banana2.1/global,1K,one candidate | The [current model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1) documents `gemini-nano-banana-2.1`, GA/global and virtual try-on. Unsupported sampling controls remain omitted. Prior synthetic connectivity succeeded; human fidelity is unproven. No obsolete try-on model fallback. |
| Preserve conservative attempt reservation | [Official standard global pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) remains USD1.50/M input,7.50/M text/reasoning output and30/M image output. Two1120-token images plus one1120-token1K output are aboutUSD0.03696 before text/reasoning. ReserveUSD0.25/attempt, dailyUSD5; alerts are separate, not caps. |
| Dedicated Firebase site in asia-south1 | [Hosting Cloud Run guidance](https://firebase.google.com/docs/hosting/cloud-run) supports this region and pinned rewrite revisions. Existing default site is preserved; no new domain needed. __session remains required by [Hosting cookie handling](https://firebase.google.com/docs/hosting/manage-cache#using_cookies). |
| Standard Authorization for worker OIDC | [Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service?hl=en) strips the signature from X-Serverless-Authorization. The existing verifier needs the original signed JWT and canonical worker audience/dispatch email. |
| Existing user ADC for operator CLI | Java21 standalone seed/DB helpers avoid public admin endpoints, proxy/IP allowlists, CloudRunJobs and downloaded keys. Existing Firebase CLI read-only project listing also worked through ADC. |
| V10 metadata enqueue plus existing deletion queue | Missing catalog orphan deletion is a lifecycle integration gap, not a reason for another queue/service. New markers and late-write guards preserve transactional ownership and retry after partial I/O. |
| Reuse structured Boot logging with safe event boundary | JSON formatting alone cannot remove secrets from arbitrary exception messages. Root's safe allowlist plus [Boot structured JSON controls](https://docs.spring.io/spring-boot/reference/features/logging.html) supplies Cloud Logging severity and suppresses stack traces. |

No unresolved implementation research decision blocks planning. Recheck model lifecycle/rates immediately before the authorized live run if execution is delayed. Platform availability, actual worker/signing behavior, CAPTCHA risk decisions, performance, backup restore and monitor ingestion remain things to measure, not assumptions of success.
