# Identity implementation decisions

Spring Boot4.1.2 offers spring-boot-starter-session-jdbc and needs no explicit EnableJdbcHttpSession annotation: https://docs.spring.io/spring-boot/reference/web/spring-session.html . Flyway owns the official PostgreSQL Spring Session schema: https://docs.spring.io/spring-session/reference/configuration/jdbc.html .

Use Spring Security's HttpSessionSecurityContextRepository, explicit authentication persistence and session ID rotation for custom JSON login. Session principal is an account UUID string so session serialization does not contain mutable private account objects. Re-query active account and memberships on authorized requests.

Passwords use BCrypt and minimum12characters. Recovery codes contain random entropy and store SHA256 hashes; rate-limited recovery atomically consumes one code while changing password. Credentials and contact identifiers never enter audit payloads.

Lock global administration_guard then affected store rows in sorted ID order before any global disablement; ordinary store mutations use the same store lock boundary. This straightforward serialization favors correctness at MVP scale over complex optimistic retries.
