# Private GCP demo data

The operator wrapper runs `com.virtualwardrobe.demo.DemoMain` from the final tested backend JAR. This standalone entry point does not start Spring, a web listener, the worker or an image provider. It connects directly to the isolated demo PostgreSQL database and private media bucket through the existing user application-default credentials. It creates no login grant or service-account key. Only seed can run schema migrations after validating its target; status and cleanup dry-run do not initialize or migrate the database or create objects/files.

The wrapper accepts only project `virtualtryon-511016`, environment `demo`, database `virtualwardrobe-demo-db` in `asia-south1`, and the corresponding VirtualWardrobe bucket. It refuses production/unknown shell environments, another project, dataset IDs outside its owned version patterns, a foreign SQL connection name, Java versions other than 21, and a JAR without the feature 007 standalone entry point. It does not touch StyleReel resources.

Two dataset profiles have separate ownership and cleanup. Start with these recommended IDs:

| Dataset | Purpose |
| --- | --- |
| `virtualwardrobe-demo-v1` | Standard fictional showroom with owned synthetic garments, workforce and customer fixtures. |
| `virtualwardrobe-load-v1` | Independent load profile with 1,000 published products for the actual A8 performance measurements. |

The only accepted names match `virtualwardrobe-demo-v[1-9][0-9]{0,3}` or `virtualwardrobe-load-v[1-9][0-9]{0,3}`. The profile is inferred from the name; load always requests 1,000 products. Deleted IDs remain tombstoned. To seed again after cleanup, explicitly choose the next unused version, such as `virtualwardrobe-demo-v2`; the wrapper never reuses a deleted ID or silently selects another dataset. Credential filenames and receipt validation use that exact requested ID.

Use the existing local source images and `provenance.json` under `apps/web/public/demo`. Keep that folder available when seeding; `--assets /absolute/path` can select another reviewed copy. Product normalization and provenance validation remain the backend CLI's responsibility. A changed or missing existing credential manifest must not reset accounts or passwords.

These commands are **plans only** and make no cloud requests:

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1
python3 scripts/gcp/cloud-demo.py status --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1
python3 -m unittest discover -s scripts/gcp -p test_cloud_demo.py -v
```

After the final release is authorized for actual cloud execution, `--run` executes the private command:

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1 --run
python3 scripts/gcp/cloud-demo.py status --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1 --run
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
```

The default Java home is `/Users/arunman/Library/Java/JavaVirtualMachines/ms-21.0.7/Contents/Home`; `--java-home` can select an explicit Java 21 installation. The JAR defaults to `services/backend/target/backend-0.0.1-SNAPSHOT.jar`; `--jar` can select the final tested packaged JAR. The wrapper records its SHA-256 for traceability and caps the child execution at ten minutes. If a run fails or times out, inspect dataset status before retrying; a partial seed may already have written owned records or objects.

The database password is fetched from Secret Manager into a captured child environment. Every SQL lookup includes the explicit project. The Java environment pins `APP_GCP_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`, the JDBC Cloud SQL connector URL, database user, private bucket and signer identity. Inherited Spring, application, loader and Java-agent overrides are removed. The password never appears in argv, reports or printed shell substitutions.

Credentials are written by the CLI only to these ignored local files, with mode `0600`, under the owner-only `work/gcp` directory:

```text
work/gcp/demo-credentials-virtualwardrobe-demo-v1.json
work/gcp/demo-credentials-virtualwardrobe-demo-v1.txt
work/gcp/demo-credentials-virtualwardrobe-load-v1.json
work/gcp/demo-credentials-virtualwardrobe-load-v1.txt
```

Read them locally to sign in; do not paste their contents into terminal logs, screenshots, reports or Git. Existing symlinked, hard-linked, shared or non-owner credential files are refused. Cloud Build source filters exclude these filename patterns even if a future operator accidentally places a copy outside `work/`.

Cleanup has two execution gates. The first command connects to the private CLI and previews the exact dataset cleanup; it does not request deletion. Only the second asks the CLI to execute it:

```bash
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run --execute-cleanup
```

Remove the load profile after its measurements. Keep the standard showroom for the hosted demo unless its removal is explicitly intended. Cleanup must use the dataset manifest, retain unrelated/bootstrap records and refuse unsafe ownership conflicts; it must not recursively delete a bucket or truncate shared tables. Inspect the resulting dataset status afterward. Credential files remain private local artifacts; their presence does not authorize deleting other users.

The wrapper captures raw Java and cloud errors instead of printing them. Successful reports contain only the fixed project/dataset, operation, JAR fingerprint, state, counts and booleans, written to `work/gcp/demo-operator-<dataset>-<command>.json`. Result markers must match the requested schema, command, dataset and profile. A successful mocked wrapper test proves command construction and secret handling only; actual hosted seeding, idempotent reruns and targeted cleanup need separate release evidence.
