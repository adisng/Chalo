# Shared Volunteer Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure cross-device sharing, supervisor and assigned-worker views, reviewed flexible Excel import, and Excel export while preserving offline data.

**Architecture:** Supabase Auth/Postgres/RLS is the source of truth; Dexie remains an offline cache/outbox. Imports normalize workbook rows into a reviewed batch before an atomic database write; exports serialize shared normalized data to `.xlsx`.

**Tech Stack:** Next.js, React, TypeScript, Dexie, Supabase JS/Postgres/Auth/Realtime, SheetJS, Vitest, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-19-shared-volunteer-workspace-design.md`

## Global Constraints

- Supervisor role has workspace-wide access; worker role can access only assigned hostels.
- RLS must enforce permissions independently of the UI.
- Roster-only volunteers need no login and remain manageable by the supervisor.
- Import requires review and explicit confirmation; AI never silently changes or commits data.
- Dates are stored as local `YYYY-MM-DD` strings.
- Keep source workbook files out of hosted storage by default.
- Never clear existing IndexedDB data during auth, migration, or service-worker updates.
- Keep private credentials server-side; public clients use only publishable credentials.

## Review Focus

- Worker direct API access to another assignment — RLS test with two workers.
- Workbook duplicate/ambiguous names — import mapping test requires reviewer resolution.
- Malformed dates/session values — importer flags and preserves source row, never silently drops it.
- Offline concurrent edits — sync conflict test preserves both server and local versions pending resolution.
- Partial import failure — transaction test confirms no subset is committed.

---

### Task 1: Supabase schema, roles, and row-level policies

**Files:** Create `supabase/migrations/20261120000000_shared_workspace.sql`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, and `tests/permissions/rls.test.ts`; modify `.env.example`, `package.json`, and lockfile.

**Interfaces:** Define workspace, membership/profile, volunteer, hostel, assignment, planned-visit, visit-log, import-batch, and audit-event tables with stable UUIDs. Roles are `supervisor` and `worker`; volunteers may have nullable `auth_user_id`.

- [ ] Write RLS tests: supervisor sees all workspace records; worker A sees assigned hostels only; worker B’s records are inaccessible; roster-only volunteer remains supervisor-manageable.
- [ ] Apply schema/policies in a local Supabase test environment and verify those tests fail before policy implementation and pass after.
- [ ] Add Supabase dependencies and environment validation; do not add service-role credentials to client bundles.
- [ ] Run permission tests and inspect generated migration SQL for default-deny policies.

### Task 2: Sign-in, workspace selection, and role-aware navigation

**Files:** Create `components/auth/SignIn.tsx`, `components/workspace/ActiveUser.tsx`, `lib/auth.ts`; modify `app/page.tsx`, `app/layout.tsx`, and relevant styles.

**Interfaces:** `getCurrentMembership(): Promise<Membership|null>` and `subscribeAuth(callback)`; workspace membership, not a client-selected name, determines permissions.

- [ ] Add tests for signed-out, worker, and supervisor landing states.
- [ ] Implement sign-in/session persistence and workspace membership loading.
- [ ] Show active person and role; allow authorized account switching by sign-out/sign-in.
- [ ] Expose supervisor management screens only to supervisors while retaining RLS protections.
- [ ] Verify session refresh and revoked membership behavior.

### Task 3: Volunteer roster and assignment management

**Files:** Create `lib/volunteers.ts`, `components/supervisor/VolunteerRoster.tsx`, `components/supervisor/AssignmentEditor.tsx`; modify database types and navigation.

**Interfaces:** `listVolunteers()`, `saveVolunteer(input)`, `assignHostel({volunteerId,hostelId,activeFrom,activeTo})`, `listVisibleHostels(membership)`.

- [ ] Test adding roster-only volunteer, assigning/reassigning a hostel, and date-bounded assignment visibility.
- [ ] Implement supervisor roster list and assignment editor.
- [ ] Filter worker hostel/schedule/log queries by server-authorized assignment membership.
- [ ] Test that unassigned workers see an empty assignment state and cannot mutate another volunteer’s progress.

### Task 4: Flexible workbook inspection and mapping profiles

**Files:** Refactor `lib/import.js` into `lib/excel/inspectWorkbook.ts`, `mapWorkbook.ts`, `normalizeRows.ts`; create `tests/excel/import-mapping.test.ts` and fixture documentation.

**Interfaces:** `inspectWorkbook(file): Promise<WorkbookInspection>`, `mapWorkbook(inspection, mapping): NormalizedImportDraft`, `normalizeRows(rows, mapping): ImportRow[]`.

- [ ] Add fixtures for two distinct workbook layouts and tests identifying sheets/header rows/columns and retaining original sheet/row values.
- [ ] Implement deterministic header aliases and sample-value inference; do not infer assignment identity from ambiguous duplicate names without review.
- [ ] Normalize dates, hostel identity, volunteer identity, and session formats into a draft with row-level warnings.
- [ ] Test blanks, merged/carry-forward cells, duplicate rows, invalid dates, mixed session notation, unknown volunteers, and multiple candidate sheets.
- [ ] Preserve every candidate source row in output, including rejected/flagged rows.

### Task 5: Import mapping review and atomic confirmation

**Files:** Create `components/import/WorkbookMapper.tsx`, `components/import/ImportReview.tsx`, `lib/importBatch.ts`; modify `app/page.tsx`.

**Interfaces:** `commitImportBatch(draft, actor): Promise<ImportBatchResult>`; persist source hash, workbook name, mapping profile, counts, source row references, reviewer, and timestamp, but not workbook bytes.

- [ ] Test review rendering for proposed mappings, volunteers, assignments, source values, flags, and fixes.
- [ ] Test cancel/no-write and transaction rollback on invalid rows or insert failure.
- [ ] Implement mapping editor and review-first confirmation flow.
- [ ] Supervisor can create roster-only volunteers, edit progress and resolve mapping warnings before commit.
- [ ] Add import-batch rollback that reverses only the batch’s schedule changes and preserves visit logs.
- [ ] Test at least two workbook formats end-to-end using fixture files supplied for the project.

### Task 6: Excel exports

**Files:** Create `lib/excel/exportWorkbook.ts`, `components/export/ExportControls.tsx`, and `tests/excel/export.test.ts`; modify More and supervisor views.

**Interfaces:** `buildWorkspaceWorkbook(data, options): ArrayBuffer` with Schedule, Volunteers/Assignments, and Progress/Visit Logs sheets.

- [ ] Test workbook sheet names, headers, row counts, dates, assignment names, and session values by reading generated workbooks back with SheetJS.
- [ ] Implement filtered worker export and full supervisor export.
- [ ] Add `.xlsx` download controls and include generated-at and workspace metadata.

### Task 7: Dexie offline cache, outbox, and conflict handling

**Files:** Modify `lib/db.js`; create `lib/sync/outbox.ts`, `lib/sync/reconcile.ts`, `tests/sync/offline-sync.test.ts`.

**Interfaces:** `enqueueMutation(mutation)`, `syncPending(): Promise<SyncResult>`, `reconcileRecord(local, remote): Conflict|MergedRecord`.

- [ ] Test queued offline log/create/edit/delete mutations replay idempotently after reconnect.
- [ ] Test same-record concurrent edits are surfaced as conflicts with actor and timestamps; no last-write-wins silent loss.
- [ ] Migrate existing local counselor records into the signed-in workspace via explicit preview and confirmation.
- [ ] Ensure backups include pending outbox entries and restore remains transactional.
- [ ] Test that service-worker update and sign-in never clear IndexedDB.

### Task 8: Realtime refresh, audit, and operational setup

**Files:** Create `lib/sync/realtime.ts`, `docs/supabase-setup.md`, `docs/excel-import-guide.md`, and update `docs/pwa-update-checklist.md`.

- [ ] Test realtime event refresh for two clients and foreground/reconnect fallback refresh.
- [ ] Add audit events for supervisor assignment changes, manual progress edits, imports, and rollback.
- [ ] Document initial supervisor provisioning, worker invitations, environment variables, migration application, free-tier pause expectations, and backup/export.
- [ ] Add manual checklist for two-device role enforcement, offline logging, different workbook layouts, export, and recovery after an idle pause.

### Task 9: Optional AI mapping suggestions (separate gated milestone)

**Files:** Create server-only `app/api/import-mapping/route.ts`, `lib/excel/aiSuggestion.ts`, `tests/excel/ai-suggestion.test.ts`; add server environment documentation.

- [ ] Test strict schema validation and rejection of unknown column IDs or invented values.
- [ ] Implement suggestion-only mapping through a server-side provider key, rate-limited and disabled when no key is configured.
- [ ] Show suggestions as editable proposals with confidence/reasons; require the same human review and confirmation as deterministic mapping.
- [ ] Test unavailable provider, quota limit, malformed JSON, and ambiguous mapping all fall back to manual mapping.

## Execution order and acceptance

Tasks 1–3 establish identity and authorization. Tasks 4–6 establish accurate import/export. Task 7 preserves offline use while syncing. Task 8 completes operations and auditability. Task 9 is optional and must not block core workflows.

Acceptance requires passing permission tests, fixture-based import/export round trips, offline sync/conflict tests, successful static deployment configuration, and a manual two-device role/sync walkthrough. No task deploys to the production Supabase project until project credentials and initial supervisor provisioning are configured.
