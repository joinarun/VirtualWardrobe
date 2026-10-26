# Try-on acceptance

Run make dev with local mock defaults. Sign in as a customer, open a published available product, read current consent, upload an owned adult full-body JPEG/PNG, request a job, leave and return to its status. A local fixture output must say Demo preview. Save it, open the gallery, download and delete; another customer and workforce account must receive404 on private IDs.

Run backend tests with real PostgreSQL and the existing1GiB memory limit, then the browser suite. Tests use fake providers and no paid calls. Local durable delivery is worker-only and survives API/browser closure. Internal HTTP requires an explicitly configured APP_WORKER_LOCAL_TOKEN and is refused for deployed environments.

Deployed demo uses real Google under APP_ENVIRONMENT=demo and says AI EVALUATION DEMO. Verify its actual asynchronous customer workflow separately during root-owned deployment smoke. Production Google generation must remain disabled without an operator-approved matching40-pair human quality report. Local/source/provider output and deleted objects have the retention boundaries described in contracts/api.md.
