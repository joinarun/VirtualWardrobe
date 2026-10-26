# Demo acceptance

From virtual-try-on after make bootstrap and make dev:

```bash
make bootstrap-admin
# Sign in at /staff and finish the independent operator's password change.
make demo-seed
make demo-status
# Review the plan; this does not delete anything.
make demo-cleanup
# Execute only when the reviewed dataset has no unrelated incoming references.
make demo-cleanup-execute
```

The standard default is virtualwardrobe-demo-v1, with12 users,3 stores and30 sarees. Credentials are generated once in ignored work/demo/demo-credentials-virtualwardrobe-demo-v1.json and its text sibling, both0600 in an owner-only directory. Open them locally; do not paste them into chat, logs or Git. Seeding again preserves credentials and account edits. Missing/mismatched credentials refuse instead of resetting users.

Cleanup requires an enabled, permanent-password, non-demo platform administrator when it would remove active seeded platform administrators. Finish bootstrap password rotation first. Runtime visitor enquiries/jobs/team links are unrelated data and intentionally block cleanup. Cleanup never adopts or deletes that activity. Deleted IDs are retired; explicitly choose a fresh version such as virtualwardrobe-demo-v2.

A separate performance dataset can coexist with standard:

```bash
DATASET=virtualwardrobe-load-v1 PROFILE=load CATALOG_SIZE=1000 make demo-seed
DATASET=virtualwardrobe-load-v1 make demo-cleanup
DATASET=virtualwardrobe-load-v1 make demo-cleanup-execute
```

Each product has its own physical objects; processing is cached per owned source image. The load profile has one accepted store administrator/store and does not depend on standard data. A cleaned load ID must be replaced with an explicit new version for another local run.

For an already packaged current JAR, DEMO_SKIP_PACKAGE=true ./scripts/demo.sh seed avoids repackaging. The wrapper verifies the standalone DemoMain marker first. DEMO_CREDENTIALS_FILE may choose an absolute demo-credentials*.json path in a dedicated owner-only directory. DATASET/PROFILE/CATALOG_SIZE are environment options; no password argument exists.

The cloud wrapper defaults to a plan:

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1
```

Use the explicit operator --run option only for reviewed execution against virtualtryon-511016. See docs/gcp-demo-data.md. Existing ADC handles SQL/storage; Secret Manager supplies only a child-environment database password. Status/dry-run do not migrate or initialize an empty database. No command starts a listener, bootstrap, scheduler, worker or image provider, and production/unknown environments refuse before I/O.

The required seeded browser journey reads generated credentials into its process. It demonstrates all roles, actual owned images/video, labelled Demo preview gallery fixtures, local mock generation and the customer-to-store conversation. The standalone seed makes no paid call. Live saree quality acceptance remains a separate40-pair human gate.
