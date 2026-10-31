# Explicit app sign-in and fresh demo accounts

Owner request2026-10-31: no Google account sign-in, remove previous accounts, exactly one fresh super admin/store admin/staff/customer with short identifiers, private credentials text file, GCP deployment and GitHub code only.

FR1: Authentication requires explicit application identifier/password; Chrome Google identity cannot authenticate a customer. Preserve deliberate app sessions across mobile app switching.
FR2: Clarify customer mobile/password and store-issued credentials; reject email in customer sign-in before sending credentials.
FR3: Retire all old accounts and revoke all sessions atomically; create four distinct new identities. Store admin/staff access existing stores. Preserve catalog and spending ledger; remove old private-photo access and enqueue cleanup; anonymize old account/contact data while retaining audit references.
FR4: Output randomly generated passwords only to owner-only ignored files and private user text artifact. Never Git/log secrets.
FR5: Test real fresh/old/wrong/missing-password authentication and role scope, deploy existing GCP Hosting, push reviewed code.

Clarification: no Google OAuth exists in source. Existing app sessions are separate from Chrome identity; they are revoked by reset. Gmail domain bans are a separate optional clarification. No new provider/model request or infrastructure.
