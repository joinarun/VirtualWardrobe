# Decisions and reuse

PRD5 and constitution define the workflow; no new external dependency or changing third-party behavior is needed. Reuse JDBC/Flyway, existing workforce/store membership checks and session CSRF. Partial unique indexes plus administration/store/enquiry locking provide an explicit concurrency design. Customer locks precede store locks; staff paths never request customer account locks. History visibility is server chosen, and text redaction is an explicit privacy exception to append-only operational history. Polling30seconds avoids new notification infrastructure.
