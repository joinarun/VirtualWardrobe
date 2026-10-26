# Standalone demo operator contract

Entrypoint:

```
java -Dloader.main=com.virtualwardrobe.demo.DemoMain -cp backend-0.0.1-SNAPSHOT.jar org.springframework.boot.loader.launch.PropertiesLauncher <command> <options>
```

No SpringApplication/context/listener/bootstrap/worker/provider starts. Only seed runs Flyway after guards. Status and cleanup dry-run are read-only; cleanup execution uses the existing dataset/schema and never initializes an empty database.

Commands:

```
seed --dataset ID --assets ABS_DIR --credentials ABS_JSON [--profile standard|load] [--catalog-size N] [--project PROJECT]
status --dataset ID [--project PROJECT]
cleanup --dataset ID --dry-run [--project PROJECT]
cleanup --dataset ID --execute [--project PROJECT]
```

Dataset IDs match [a-z][a-z0-9-]{2,49}. Standard is exactly30 products; load defaults1000 and permits a bounded1–2000 size for test profiles. Distinct recommended IDs: virtualwardrobe-demo-v1 and virtualwardrobe-load-v1. Deleted dataset IDs are tombstoned; use a new ID after cleanup. Status/cleanup need no assets or credentials arguments. Cleanup is dry-run by default; --execute is explicit. Incoming unrelated/runtime references cause a safe refusal, not propagation/adoption/deletion. Cleanup also refuses DEMO_LAST_SUPER_ADMIN when it would remove active seeded platform administrators without an enabled outside super admin that has completed password rotation. Create/activate a non-demo platform administrator first.

Environment: APP_ENVIRONMENT must be local or demo (production/unknown refused before I/O). SPRING_DATASOURCE_URL/USERNAME/PASSWORD; APP_ADAPTER_MODE=local|gcp; local APP_LOCAL_DATA_DIRECTORY. GCP requires APP_GCP_PROJECT, APP_STORAGE_BUCKET, APP_STORAGE_SIGNER_SERVICE_ACCOUNT, ADC and explicit --project matching the configured project/CloudSQL connection. GOOGLE_CLOUD_QUOTA_PROJECT is set by the wrapper. No secret argument is accepted or printed. No CloudSQL proxy, web listener or generation setting is needed.

Asset root defaults in wrappers to apps/web/public/demo and contains provenance.json, the8 original saree PNGs, Ruby detail/back views and demo-preview.mp4. Hero/fonts are frontend assets; seeding validates the actual images/video and caches normalized source bytes, with unique per-media physical keys. No retailer download or paid call.

Credentials JSON schema:

```
{schemaVersion:1,datasetId,profile,fingerprint,createdAt,users:[
 {id,kind:'WORKFORCE'|'CUSTOMER',role:'SUPER_ADMIN'|'STORE_ADMIN'|'STAFF'|'CUSTOMER',
 name,identifier,password,storeIds:string[],storeNames:string[],recoveryCodes:string[]}
]}
```

The CLI requires the basename demo-credentials*.json so the project Git ignore covers credentials even with an explicit path. The local default is work/demo/demo-credentials-virtualwardrobe-demo-v1.json. JSON and its sibling text file are owner-only0600, nonsymlink and ignored. The sibling replaces a final .json suffix with .txt. Seed creates these once before database accounts; lost/mismatched files do not reset existing users. Passwords/recovery codes are never stdout, database plaintext or Git. The required seeded browser journey reads this file into process memory; role/member selection uses the explicit storeIds.

Safe stdout: exactly one line prefixed DEMO_RESULT_JSON= followed by:

```
{schemaVersion:1,command:'seed'|'status'|'cleanup',datasetId,
 profile:'standard'|'load'|null,
 state:'PREPARING'|'ACTIVE'|'DELETING'|'DELETED'|'ABSENT',changed:boolean,dryRun:boolean,
 counts:Record<string,nonnegative integer>,objects:nonnegative integer,
 credentialsJson:string|null,credentialsText:string|null}
```

No usernames/phones/passwords/recovery codes/object keys/raw errors. Failures use stable safe code text, exit2; success exit0. Wrapper verifies DemoMain.class exists in the packaged JAR before execution, requires explicit cloud target and prints only this allowlisted receipt. No HTTP seed/cleanup endpoint exists.
