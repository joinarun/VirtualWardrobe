# Scope, workflow and privacy checklist

- [x] Separate versioned contact-sharing consent and authenticated contact source defined.
- [x] Partial active uniqueness and atomic explicit claim are required; GETs remain read-only.
- [x] Store/current-role checks follow locks and eligible assignment rules.
- [x] Customer/store/account lock order avoids inversion; handlers never lock customer after store.
- [x] State/reopen/reply rules and public/internal event boundaries are explicit.
- [x] Revocation races unassign active work and preserve history.
- [x] Account deletion/retention remove all free text and contact without resurrection.
- [x] Worker maintenance/polling reuse baseline infrastructure and earlier tests are preserved.

Reviewed before implementation; no critical/high requirement gap.
