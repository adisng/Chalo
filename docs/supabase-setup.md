# Supabase workspace setup

1. The CLI is linked to project `bbawqpgyolnifrqylifb` in `supabase/config.toml`. Install it on macOS with `brew install supabase/tap/supabase` if needed.
2. Run `./scripts/setup-shared-workspace.sh`. It signs into the CLI, links the project, shows a dry-run, and asks before applying timestamped migrations. This avoids pasting partial SQL into the Dashboard.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to local `.env.local` and Vercel (the app also supports the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The local `.env.local` is ignored by Git. Never use the secret or service-role key in browser code. The provided publishable key is also bundled as a public-client fallback so the hosted app does not silently switch to device-only mode when Vercel variables are missing.
4. In Supabase Authentication > Users, invite/create Vichitra ma’am, Aditya, and Tansi. Replace the three email placeholders in `supabase/bootstrap_workspace.sql`, then run that file once in SQL Editor. It creates the Chalo workspace, three volunteer records, the supervisor membership, and two worker memberships. It fails without making changes if any account is missing.
5. Import a schedule workbook from the app. The supervisor can add roster-only volunteers and hostels; the supervisor then assigns hostels to Aditya and Tansi from Team.
6. Configure email OTP redirect URLs for local development and the deployed Chalo domain. The migration adds the workspace tables to `supabase_realtime` when that publication is available.

The migration installs row-level security and an atomic, retry-safe import RPC. Do not re-run hand-edited SQL from an old Dashboard query; the CLI tracks applied migration IDs and skips existing versions. Current CLI migration deployment flow is documented by [Supabase](https://supabase.com/docs/guides/deployment/database-migrations).
