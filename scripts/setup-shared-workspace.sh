#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="bbawqpgyolnifrqylifb"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required. On macOS install it with: brew install supabase/tap/supabase"
  echo "Then rerun this script."
  exit 1
fi

supabase login
supabase link --project-ref "$PROJECT_REF"
supabase db push --dry-run --remote
echo
echo "Review the dry-run above. This will apply the shared Chalo schema and row-level access policies to project $PROJECT_REF."
read -r -p "Apply these migrations now? [y/N] " answer
case "$answer" in
  y|Y|yes|YES) supabase db push --remote ;;
  *) echo "No database changes applied." ;;
esac
