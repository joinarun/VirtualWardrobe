# Implementation Plan Identity and stores

**Date**:2026-10-27 · **Spec**:[spec.md](spec.md)

## Summary

Extend the one Java backend with JDBC-backed account/store services, Spring Security CSRF and PostgreSQL Spring Session. Add React account/admin forms against the frozen contracts. No new service or infrastructure.

## Technical Context

Java21 Spring Boot4.1.2, JDBC/Flyway/PostgreSQL17, spring-boot-starter-session-jdbc, BCrypt via Spring Security, Google ADC/REST CAPTCHA assessment. React/TypeScript uses same-origin fetch with credentials and a CSRF header. All private/auth responses no-store. Sessions use __session and a plain session-backed CSRF token exposed through GET/auth/csrf. A singleton administration_guard then sorted store row locks serialize global/store membership administration. JDBC rate-limit rows bound authentication attempts across instances.

## Constitution Check

Pass pre/post design: account realms remain distinct, credentials stay hashed, existing-user invitations do not change passwords, no customer impersonation, active store/global final-admin invariants are transactional, same API supports future clients. Customer image and enquiry modules are not built yet; account deletion marks lifecycle for their future handlers. No constitutional amendment is introduced.

## Project Structure

services/backend/.../identity/: auth, accounts, CAPTCHA, problem responses, persisted-session security, store/membership services and CLI/bootstrap.
services/backend/src/main/resources/db/migration/V2__identity_stores.sql.
apps/web/: customer/workforce auth and store administration components.
specs/003-identity-stores/contracts/api.md freezes field/path shapes before parallel UI/backend implementation.

## Verification

Backend integration tests use existing PostgreSQL for signup/recovery/session/role boundaries and concurrent final-admin operations. MockMvc exercises CSRF and cookie-auth requests. Browser tests cover account forms, rotation and invitations; no cloud account needed. CAPTCHA tests use explicit local mode or controlled transport; real verification requires valid token, action, hostname, score. Missing Google CAPTCHA config disables signup in cloud environments. Bootstrap uses an environment secret or0600 local generated credentials.
