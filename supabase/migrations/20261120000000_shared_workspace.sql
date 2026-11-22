-- Shared Chalo workspace. Apply with `supabase db push` as a single migration.
begin;
create extension if not exists pgcrypto;

create type public.workspace_role as enum ('supervisor', 'worker');

create or replace function public.valid_session_numbers(session_values integer[])
returns boolean language sql immutable security invoker set search_path = '' as $$
  select session_values is not null and not exists (
    select 1 from unnest(session_values) as sessions(session_no)
    where sessions.session_no is null or sessions.session_no < 1 or sessions.session_no > 64
  )
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'worker',
  volunteer_id uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, normalized_name)
);

-- Reference volunteer ID and workspace together to prevent cross-workspace links.
alter table public.volunteers add constraint volunteers_id_workspace_unique unique (id, workspace_id);
alter table public.memberships add constraint memberships_volunteer_workspace_fk
  foreign key (volunteer_id, workspace_id) references public.volunteers(id, workspace_id);

create table public.hostels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  location text not null default '',
  total_sessions integer not null default 64 check (total_sessions > 0),
  archived_at timestamptz,
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);
alter table public.hostels add constraint hostels_id_workspace_unique unique (id, workspace_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  volunteer_id uuid not null,
  hostel_id uuid not null,
  active_from date,
  active_to date,
  source_batch_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (active_to is null or active_from is null or active_to >= active_from)
);
create index assignments_volunteer_dates_idx on public.assignments(volunteer_id, active_from, active_to);
create index assignments_hostel_idx on public.assignments(hostel_id);
alter table public.assignments add constraint assignments_volunteer_workspace_fk
  foreign key (volunteer_id, workspace_id) references public.volunteers(id, workspace_id) on delete cascade;
alter table public.assignments add constraint assignments_hostel_workspace_fk
  foreign key (hostel_id, workspace_id) references public.hostels(id, workspace_id) on delete cascade;

create table public.planned_visits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  volunteer_id uuid not null,
  hostel_id uuid not null,
  visit_date date not null,
  planned_sessions integer[] not null default '{}',
  outcome text not null default 'planned' check (outcome in ('planned','done','partial','skipped','rescheduled','swapped')),
  actual_hostel_id uuid,
  source_batch_id uuid,
  source_sheet text,
  source_row integer,
  source_values jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.valid_session_numbers(planned_sessions))
);
create unique index planned_visits_source_row_unique on public.planned_visits(workspace_id, source_batch_id, source_sheet, source_row)
  where source_batch_id is not null and source_sheet is not null and source_row is not null;
create index planned_visits_workspace_date_idx on public.planned_visits(workspace_id, visit_date);
create index planned_visits_volunteer_date_idx on public.planned_visits(volunteer_id, visit_date);
alter table public.planned_visits add constraint planned_visits_volunteer_workspace_fk
  foreign key (volunteer_id, workspace_id) references public.volunteers(id, workspace_id) on delete restrict;
alter table public.planned_visits add constraint planned_visits_hostel_workspace_fk
  foreign key (hostel_id, workspace_id) references public.hostels(id, workspace_id) on delete restrict;
alter table public.planned_visits add constraint planned_visits_id_workspace_unique unique (id, workspace_id);
alter table public.planned_visits add constraint planned_visits_actual_hostel_workspace_fk
  foreign key (actual_hostel_id, workspace_id) references public.hostels(id, workspace_id);

create table public.visit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  volunteer_id uuid not null,
  planned_visit_id uuid,
  hostel_id uuid not null,
  visit_date date not null,
  sessions_taught integer[] not null default '{}',
  outcome text not null default 'done' check (outcome in ('done','partial','skipped','rescheduled','swapped')),
  notes text not null default '',
  edited_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.valid_session_numbers(sessions_taught))
);
create index visit_logs_workspace_date_idx on public.visit_logs(workspace_id, visit_date);
create index visit_logs_hostel_idx on public.visit_logs(hostel_id, visit_date);
create unique index visit_logs_one_active_planned_visit
  on public.visit_logs(workspace_id, planned_visit_id)
  where planned_visit_id is not null and deleted_at is null;
alter table public.visit_logs add constraint visit_logs_volunteer_workspace_fk
  foreign key (volunteer_id, workspace_id) references public.volunteers(id, workspace_id);
alter table public.visit_logs add constraint visit_logs_hostel_workspace_fk
  foreign key (hostel_id, workspace_id) references public.hostels(id, workspace_id) on delete restrict;
alter table public.visit_logs add constraint visit_logs_planned_visit_workspace_fk
  foreign key (planned_visit_id, workspace_id) references public.planned_visits(id, workspace_id);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  workbook_name text not null,
  source_hash text not null,
  mapping_profile jsonb not null default '{}',
  row_count integer not null default 0,
  status text not null default 'committed' check (status in ('committed','reverted')),
  created_at timestamptz not null default now(),
  unique (workspace_id, source_hash)
);
alter table public.import_batches add constraint import_batches_id_workspace_unique unique (id, workspace_id);
alter table public.volunteers add constraint volunteers_batch_workspace_fk foreign key (source_batch_id, workspace_id) references public.import_batches(id, workspace_id);
alter table public.hostels add constraint hostels_batch_workspace_fk foreign key (source_batch_id, workspace_id) references public.import_batches(id, workspace_id);
alter table public.assignments add constraint assignments_batch_workspace_fk foreign key (source_batch_id, workspace_id) references public.import_batches(id, workspace_id);
alter table public.planned_visits add constraint planned_visits_batch_workspace_fk foreign key (source_batch_id, workspace_id) references public.import_batches(id, workspace_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_volunteer_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_events add constraint audit_actor_volunteer_workspace_fk
  foreign key (actor_volunteer_id, workspace_id) references public.volunteers(id, workspace_id);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for table_name in select unnest(array['hostels','assignments','planned_visits','visit_logs','volunteers']::text[]) loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.workspace_id = target_workspace and m.user_id = (select auth.uid()))
$$;

create or replace function public.is_workspace_supervisor(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.workspace_id = target_workspace and m.user_id = (select auth.uid()) and m.role = 'supervisor')
$$;

create or replace function public.can_access_hostel(target_workspace uuid, target_hostel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_supervisor(target_workspace) or exists (
    select 1 from public.memberships m join public.assignments a on a.volunteer_id = m.volunteer_id
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid()) and a.workspace_id = target_workspace
      and a.hostel_id = target_hostel
      and (a.active_from is null or a.active_from <= current_date)
      and (a.active_to is null or a.active_to >= current_date)
  )
$$;

create or replace function public.can_act_as_volunteer(target_workspace uuid, target_volunteer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_supervisor(target_workspace) or exists (
    select 1 from public.memberships m where m.workspace_id=target_workspace and m.user_id=(select auth.uid()) and m.volunteer_id=target_volunteer
  )
$$;

create or replace function public.sync_planned_visit_from_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.planned_visit_id is null then return new; end if;
  if new.deleted_at is null then
      update public.planned_visits set outcome=new.outcome, actual_hostel_id=new.hostel_id, updated_at=now()
      where id=new.planned_visit_id and workspace_id=new.workspace_id;
  elsif not exists(select 1 from public.visit_logs l where l.planned_visit_id=new.planned_visit_id and l.deleted_at is null and l.id<>new.id) then
    update public.planned_visits set outcome='planned', actual_hostel_id=null, updated_at=now()
      where id=new.planned_visit_id and workspace_id=new.workspace_id;
  end if;
  return new;
end
$$;
create trigger visit_log_sync_planned after insert or update of deleted_at, outcome, hostel_id on public.visit_logs
  for each row execute function public.sync_planned_visit_from_log();

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.volunteers enable row level security;
alter table public.hostels enable row level security;
alter table public.assignments enable row level security;
alter table public.planned_visits enable row level security;
alter table public.visit_logs enable row level security;
alter table public.import_batches enable row level security;
alter table public.audit_events enable row level security;

create policy workspace_member_read on public.workspaces for select using (public.is_workspace_member(id));
create policy membership_member_read on public.memberships for select using (public.is_workspace_supervisor(workspace_id) or user_id=(select auth.uid()));
create policy membership_supervisor_manage on public.memberships for all using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy volunteer_visible_read on public.volunteers for select using (
  public.is_workspace_supervisor(volunteers.workspace_id) or exists(select 1 from public.memberships m where m.workspace_id=volunteers.workspace_id and m.user_id=(select auth.uid()) and m.volunteer_id=volunteers.id)
);
create policy volunteer_supervisor_manage on public.volunteers for all using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy hostel_assigned_read on public.hostels for select using (public.can_access_hostel(workspace_id,id));
create policy hostel_supervisor_manage on public.hostels for all using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy assignment_visible_read on public.assignments for select using (
  public.is_workspace_supervisor(assignments.workspace_id) or (
    public.can_act_as_volunteer(assignments.workspace_id, assignments.volunteer_id)
    and public.can_access_hostel(assignments.workspace_id, assignments.hostel_id)
    and (assignments.active_from is null or assignments.active_from <= current_date)
    and (assignments.active_to is null or assignments.active_to >= current_date)
  )
);
create policy assignment_supervisor_manage on public.assignments for all using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy planned_visit_assigned_read on public.planned_visits for select using (
  public.is_workspace_supervisor(workspace_id) or (
    public.can_access_hostel(workspace_id,hostel_id)
    and public.can_act_as_volunteer(workspace_id,volunteer_id)
  )
);
create policy planned_visit_worker_insert on public.planned_visits for insert with check (public.can_access_hostel(workspace_id,hostel_id) and public.can_act_as_volunteer(workspace_id,volunteer_id));
create policy planned_visit_supervisor_manage on public.planned_visits for all using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy visit_log_assigned_read on public.visit_logs for select using (public.can_access_hostel(workspace_id,hostel_id));
create policy visit_log_assigned_insert on public.visit_logs for insert with check (
  public.can_access_hostel(workspace_id,hostel_id)
  and public.can_act_as_volunteer(workspace_id,volunteer_id)
  and edited_by=(select auth.uid())
  and (planned_visit_id is null or exists (
    select 1 from public.planned_visits pv
    where pv.id=planned_visit_id and pv.workspace_id=visit_logs.workspace_id and pv.volunteer_id=visit_logs.volunteer_id
  ))
);
create policy visit_log_assigned_update on public.visit_logs for update using (public.is_workspace_supervisor(workspace_id) or (public.can_access_hostel(workspace_id,hostel_id) and public.can_act_as_volunteer(workspace_id,volunteer_id))) with check (public.can_access_hostel(workspace_id,hostel_id) and public.can_act_as_volunteer(workspace_id,volunteer_id) and edited_by=(select auth.uid()));
create policy visit_log_supervisor_delete on public.visit_logs for delete using (public.is_workspace_supervisor(workspace_id));
create policy import_batch_member_read on public.import_batches for select using (public.is_workspace_supervisor(workspace_id) or uploaded_by=(select auth.uid()));
create policy import_batch_member_upload on public.import_batches for insert with check (public.is_workspace_member(workspace_id) and uploaded_by=(select auth.uid()));
create policy import_batch_supervisor_update on public.import_batches for update using (public.is_workspace_supervisor(workspace_id)) with check (public.is_workspace_supervisor(workspace_id));
create policy import_batch_supervisor_delete on public.import_batches for delete using (public.is_workspace_supervisor(workspace_id));
create policy audit_supervisor_read on public.audit_events for select using (public.is_workspace_supervisor(workspace_id));
create policy audit_member_insert on public.audit_events for insert with check (public.is_workspace_member(workspace_id) and actor_user_id=(select auth.uid()));

-- One RPC makes each reviewed workbook import atomic and safe to retry by hash.
create or replace function public.commit_workspace_import(
  p_workspace_id uuid,
  p_workbook_name text,
  p_source_hash text,
  p_mapping_profile jsonb,
  p_rows jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  batch_id uuid;
  row_data jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Import must contain at least one reviewed visit row';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  insert into public.import_batches(workspace_id, uploaded_by, workbook_name, source_hash, mapping_profile, row_count)
  values (p_workspace_id, (select auth.uid()), p_workbook_name, p_source_hash, coalesce(p_mapping_profile, '{}'::jsonb), jsonb_array_length(p_rows))
  on conflict (workspace_id, source_hash) do nothing
  returning id into batch_id;

  if batch_id is null then
    raise exception 'This workbook has already been imported into the workspace';
  end if;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    if nullif(row_data->>'volunteer_id','') is null
      or nullif(row_data->>'hostel_id','') is null
      or nullif(row_data->>'visit_date','') is null
      or jsonb_typeof(row_data->'planned_sessions') is distinct from 'array'
      or jsonb_array_length(row_data->'planned_sessions') = 0
      or nullif(row_data->>'source_row','') is null then
      raise exception 'A reviewed row is missing volunteer, hostel, date, or sessions';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(row_data->'planned_sessions') as sessions(session_value)
      where sessions.session_value::integer < 1 or sessions.session_value::integer > 64
    ) then
      raise exception 'Session numbers must be between 1 and 64';
    end if;
    insert into public.planned_visits(
      workspace_id, volunteer_id, hostel_id, visit_date, planned_sessions,
      source_batch_id, source_sheet, source_row, source_values
    ) values (
      p_workspace_id,
      (row_data->>'volunteer_id')::uuid,
      (row_data->>'hostel_id')::uuid,
      (row_data->>'visit_date')::date,
      array(select jsonb_array_elements_text(row_data->'planned_sessions')::integer),
      batch_id,
      coalesce(nullif(row_data->>'source_sheet',''), 'Sheet1'),
      (row_data->>'source_row')::integer,
      coalesce(row_data->'source_values', '{}'::jsonb)
    );
  end loop;
  return batch_id;
end
$$;

revoke all on public.workspaces, public.memberships, public.volunteers, public.hostels, public.assignments, public.planned_visits, public.visit_logs, public.import_batches, public.audit_events from public, anon;
grant usage on schema public to authenticated;
grant select on public.workspaces, public.memberships, public.volunteers, public.hostels, public.assignments, public.planned_visits, public.visit_logs, public.import_batches, public.audit_events to authenticated;
grant insert, update, delete on public.memberships, public.volunteers, public.hostels, public.assignments, public.planned_visits, public.visit_logs, public.import_batches, public.audit_events to authenticated;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_supervisor(uuid) from public, anon;
revoke all on function public.can_access_hostel(uuid, uuid) from public, anon;
revoke all on function public.can_act_as_volunteer(uuid, uuid) from public, anon;
revoke all on function public.sync_planned_visit_from_log() from public, anon, authenticated;
revoke all on function public.commit_workspace_import(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_supervisor(uuid) to authenticated;
grant execute on function public.can_access_hostel(uuid, uuid) to authenticated;
grant execute on function public.can_act_as_volunteer(uuid, uuid) to authenticated;
grant execute on function public.commit_workspace_import(uuid, text, text, jsonb, jsonb) to authenticated;
revoke all on function public.valid_session_numbers(integer[]) from public, anon;
grant execute on function public.valid_session_numbers(integer[]) to authenticated;
commit;
