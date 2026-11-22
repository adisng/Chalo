# Shared Volunteer Workspace Design

## Intent

Turn Chalo from a single-device, single-counselor tracker into a shared workspace for hostel schedules and progress. Aditya and Tansi use the app to manage only hostels assigned to them. Vichitra ma’am supervises the full volunteer roster, can upload broader workbooks, assign hostels, and record or adjust progress for volunteers who do not have app accounts.

The workspace must make different Excel layouts usable while preserving accurate source data. Imports are reviewed and confirmed before they modify the schedule; exports provide the current schedule and progress in Excel form.

## Goals

- Shared online data and authentication across phones and browsers.
- Supervisor role with access to all volunteers, hostels, schedules, and progress.
- Worker role filtered to that worker’s assigned hostels.
- Workbook imports can describe volunteers with or without accounts.
- Column/worksheet mapping supports varying Excel formats, with deterministic parsing first and optional AI suggestions only for ambiguous mappings.
- Human review of proposed rows, dates, sessions, hostels, volunteer assignments, warnings, and fixes before committing an import.
- Export schedules and progress as `.xlsx` workbooks.
- Preserve the existing offline-first behavior and local IndexedDB cache; sync changes when connectivity returns.
- Do not upload or retain source workbook files unless explicitly needed; persist normalized records and import provenance instead.

## Non-goals

- Requiring every roster volunteer to create an account.
- Letting AI silently infer, correct, or commit schedule facts.
- Training a custom ML model for the initial release; there is too little labeled data and deterministic mapping plus reviewed suggestions is cheaper and safer.
- Replacing the current visual design or PWA update flow as part of this project.

## Roles and access

- `supervisor`: Vichitra ma’am; may see and manage every volunteer, assignment, hostel, visit, and import in the workspace.
- `worker`: Aditya or Tansi; may see and log progress for assigned hostels only.
- `roster volunteer`: a schedule identity without an app login; visible and manageable to the supervisor, with assigned work tracked like other volunteers.
- The active signed-in account determines identity. A freely selectable profile is not an authorization mechanism.
- Enforce authorization in Supabase Row Level Security (RLS), not only by hiding UI elements.

## Data and sync architecture

- Supabase Auth identifies the three app users; Postgres stores workspaces, profiles/roles, volunteers, hostels, assignments, schedule rows, visit logs, import batches, and audit events.
- Every business record belongs to a workspace and has stable IDs, timestamps, and source/import provenance where applicable.
- Supabase RLS enforces supervisor-wide access and worker assignment scoping.
- Dexie remains a local cache/outbox for offline viewing and edits. Sync operations use stable IDs and idempotent upserts; conflicts are surfaced rather than silently overwriting newer edits.
- Do not store workbook binaries in the database. Import parsing runs client-side and submits reviewed normalized rows.
- Use realtime subscriptions for active shared changes; refetch on app foreground and reconnect to cover missed events.
- Existing single-user IndexedDB data requires an explicit one-time migration/claim flow after sign-in. Never clear local data as part of account setup.

## Excel import and export

- Import scans workbook sheet names, header rows, and sample values. It proposes mappings for volunteer, hostel name/code, date, sessions, and optional schedule metadata.
- Known formats use saved deterministic mapping profiles. Unknown layouts open a mapping editor with source columns and sample values.
- Optional AI may suggest a mapping from header/sample text, but its output is treated as an untrusted suggestion and is never used to auto-correct values or bypass review.
- Normalize dates as local `YYYY-MM-DD`; preserve original cell values and source row/sheet in import provenance.
- Review shows proposed volunteer identity, hostel, date, session list, warnings, duplicates, and corrections. Supervisor can edit volunteer/assignment/progress and confirm before one atomic import.
- Import batches are identifiable and reversible without deleting unrelated logs.
- Export produces `.xlsx` with separate Schedule, Volunteers/Assignments, and Progress/Visit Logs sheets, retaining source identifiers where useful.

## Privacy, cost, and reliability

- Keep the database limited to normalized operational records; do not upload original workbook files by default.
- Supabase Free is the initial hosting target. Its current quotas and inactivity pause behavior are operational constraints, not permanent guarantees; review provider terms before launch and monitor usage.
- Store API credentials only in server-side environment variables. If AI mapping is enabled, route calls through a server endpoint with rate limits and avoid sending personal data not needed for mapping.
- AI mapping must degrade gracefully to manual mapping when unavailable or over quota.
- Provide export/backup so the team can retain a copy independent of the service.

## Approaches considered

1. **Supabase shared workspace (recommended and selected):** auth, Postgres, RLS, and realtime provide shared multi-device data and enforce supervisor/worker permissions. Costs are low for three users and normalized schedule data; the free project can pause after inactivity.
2. **Exchange Excel files:** avoids a hosted database but creates stale copies and conflicts, and does not provide reliable live supervision.
3. **Train a custom model:** requires labeled examples and ongoing maintenance; it adds complexity without improving correctness over reviewed column mapping for this small team.

## Decisions

- Use Supabase for shared identity, storage, RLS, and realtime.
- Aditya and Tansi see assigned hostels only; Vichitra sees and manages all roster volunteers and hostels.
- Workbook uploads may include roster-only volunteers; Vichitra can track or alter their progress.
- Excel layout may vary. Use deterministic detection/mapping and a review screen; AI is optional suggestion-only assistance, not an authority.
- Support Excel export for schedule and progress.
- Preserve offline local data and require explicit migration/sync behavior.

## Open implementation choices

- Authentication invitation/reset method and how the initial supervisor account is provisioned.
- Workspace membership and whether the app supports one workspace or multiple organizations (default proposal: one workspace).
- Conflict resolution UI for concurrent supervisor/worker edits.
- Which workbook formats are available as fixtures and whether roster names have a stable identifier beyond display name.
- Whether optional AI mapping ships in the first milestone or follows after deterministic mapping is proven.

## Success criteria

- A worker cannot read another worker’s unassigned hostel data through either UI or direct API requests.
- Vichitra can see all workers, including roster-only volunteers, and can manage their assignments and progress.
- Two devices observe confirmed changes after sync/realtime refresh without loss of local offline edits.
- At least two structurally different workbook layouts can be mapped, reviewed, imported, and exported without silently dropping or changing source rows.
- Review can cancel or roll back an import batch without affecting existing logs.
- Existing local schedule/log data remains available through migration and backup/restore.
