# Foundation data model

`app_installation`: singleton record with immutable installation_id and created_at; proves PostgreSQL migration wiring only. No account, product or image records are implemented here.

`ApplicationStatus`: status, application, version, executionMode, adapterMode and imageProvider. Public liveness contains no credentials or host paths.

`DemoImageMetadata`: provider=mock, demo=true and label=Demo preview. Adapter interfaces define future work without falsely claiming live processing.
