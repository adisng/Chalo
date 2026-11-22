begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','supervisor@chalo.test','unused',now(),'{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','worker-a@chalo.test','unused',now(),'{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','worker-b@chalo.test','unused',now(),'{}','{}',now(),now());

insert into public.workspaces(id,name) values ('20000000-0000-4000-8000-000000000001','RLS Test');
insert into public.volunteers(id,workspace_id,display_name,normalized_name) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Supervisor','supervisor'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Worker A','worker a'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Worker B','worker b'),
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Roster Only','roster only');
insert into public.memberships(workspace_id,user_id,role,volunteer_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','supervisor','30000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','worker','30000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','worker','30000000-0000-4000-8000-000000000003');
insert into public.hostels(id,workspace_id,code,name) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','H1','Hostel 1'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','H2','Hostel 2');
insert into public.assignments(workspace_id,volunteer_id,hostel_id) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.hostels),1::bigint,'worker sees only assigned hostel');
select is((select count(*) from public.memberships),1::bigint,'worker cannot enumerate team memberships');
select is((select count(*) from public.volunteers),1::bigint,'worker sees only own volunteer profile');
insert into public.import_batches(id,workspace_id,uploaded_by,workbook_name,source_hash,row_count)
values ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','worker.xlsx','testhash',1);
insert into public.planned_visits(id,workspace_id,volunteer_id,hostel_id,visit_date,planned_sessions,source_batch_id,source_sheet,source_row)
values ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','2026-11-20',array[1,2],'50000000-0000-4000-8000-000000000001','Visits',2);
select is((select count(*) from public.planned_visits),1::bigint,'worker can upload a planned visit for own assignment');
select throws_ok($$insert into public.planned_visits(workspace_id,volunteer_id,hostel_id,visit_date,planned_sessions) values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','2026-11-20',array[1,2])$$,'42501',null,'worker cannot upload a coworker assignment');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.hostels),1::bigint,'second worker sees only own assigned hostel');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.hostels),2::bigint,'supervisor sees all hostels');
select is((select count(*) from public.volunteers),4::bigint,'supervisor sees roster-only volunteers');

select * from finish();
rollback;
