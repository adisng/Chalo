import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root=process.cwd()
const migrationName='20261120000000_shared_workspace.sql'
const sql=readFileSync(join(root,'supabase/migrations',migrationName),'utf8')

describe('shared workspace migration',()=>{
  it('uses Supabase CLI timestamp naming and wraps the complete migration',()=>{
    expect(migrationName).toMatch(/^\d{14}_.+\.sql$/)
    expect(sql.trimStart()).toMatch(/^--[^\n]*\nbegin;/i)
    expect(sql.trimEnd()).toMatch(/commit;$/i)
  })

  it('pre-caches only the current versioned shell and hashed build assets',()=>{
    const worker=readFileSync(join(root,'public/sw.js'),'utf8')
    const stamp=readFileSync(join(root,'scripts/stamp-sw.js'),'utf8')
    expect(worker).toContain("const VERSION = '__BUILD_ID__'")
    expect(worker).toContain("const STATIC = '__STATIC_ASSETS__'")
    expect(worker).toContain('key !== SHELL && key !== ASSETS')
    expect(stamp).toContain("replaceAll(\"'__STATIC_ASSETS__'\",JSON.stringify(JSON.stringify(assets)))")
  })

  it('keeps each composite foreign key under its ALTER TABLE statement',()=>{
    const lines=sql.split(/\r?\n/)
    lines.forEach((line,index)=>{
      if(/^\s*foreign key\s*\(/i.test(line)){
        expect(lines[index-1]).toMatch(/^alter table public\.[a-z_]+ add constraint [a-z_]+$/i)
      }
    })
  })

  it('creates referenced unique keys before dependent constraints and enables RLS everywhere',()=>{
    const order=[
      ['volunteers_id_workspace_unique','memberships_volunteer_workspace_fk'],
      ['hostels_id_workspace_unique','assignments_hostel_workspace_fk'],
      ['planned_visits_id_workspace_unique','visit_logs_planned_visit_workspace_fk'],
      ['import_batches_id_workspace_unique','volunteers_batch_workspace_fk'],
    ]
    for(const [uniqueKey,foreignKey] of order)expect(sql.indexOf(uniqueKey)).toBeLessThan(sql.indexOf(foreignKey))
    for(const table of ['workspaces','memberships','volunteers','hostels','assignments','planned_visits','visit_logs','import_batches','audit_events'])expect(sql).toContain(`alter table public.${table} enable row level security;`)
    expect(sql).toContain('from public, anon')
  })

  it('commits reviewed imports in one RPC and makes retries safe by workbook hash',()=>{
    expect(sql).toContain('unique (workspace_id, source_hash)')
    expect(sql).toContain('source_values jsonb not null default')
    expect(sql).toContain('public.valid_session_numbers(planned_sessions)')
    expect(sql).toContain('public.valid_session_numbers(sessions_taught)')
    expect(sql).toContain('visit_logs_one_active_planned_visit')
    expect(sql).toContain("pubname = 'supabase_realtime'")
    expect(sql).toMatch(/create or replace function public\.commit_workspace_import[\s\S]*?security invoker[\s\S]*?end\s*\$\$;/i)
  })
})
