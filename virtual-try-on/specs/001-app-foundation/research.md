# Foundation research

- Decision: Java21 and Spring Boot4.1.2. Official Initializr metadata reports this stable default and the system-requirements page supports Java17–27. Use official Maven Wrapper. Sources: https://start.spring.io/metadata/client and https://docs.spring.io/spring-boot/system-requirements.html (checked2026-10-26).
- Decision: React19.3.1, Vite8.3.4, TypeScript6.0.3 and Node24, generated from current official create-vite9.3.1 react-ts template. Pin package versions and lockfile. Source: https://vite.dev/guide/ (checked2026-10-26).
- Decision: containerized Java builds and PostgreSQL avoid changing the user's host JDK17. A host Node24 is already available for fast web verification; Docker remains the documented portable path.
- Decision: separate liveness from database readiness. Dependency failure must not be reported as a healthy service. Internal worker routes are denied by API-mode security.
- Alternative rejected: H2-only testing would not establish real PostgreSQL behavior; a separate Python service adds no foundation value.
