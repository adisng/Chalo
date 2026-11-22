-- One-time account/workspace setup. Run only after the schema migration succeeds
-- and all three email accounts exist in Supabase Authentication > Users.
-- Replace the three email literals before running. This file never enables self-promotion.
do $$
declare
  v_supervisor uuid;
  v_aditya uuid;
  v_tansi uuid;
  v_workspace uuid;
  v_supervisor_volunteer uuid;
  v_aditya_volunteer uuid;
  v_tansi_volunteer uuid;
begin
  select id into v_supervisor from auth.users where lower(email)=lower('VICHITRA_EMAIL');
  select id into v_aditya from auth.users where lower(email)=lower('ADITYA_EMAIL');
  select id into v_tansi from auth.users where lower(email)=lower('TANSI_EMAIL');
  if v_supervisor is null or v_aditya is null or v_tansi is null then
    raise exception 'Create all three Auth users and replace the email placeholders before running this script.';
  end if;

  insert into public.workspaces(name) values ('Chalo') returning id into v_workspace;

  insert into public.volunteers(workspace_id,auth_user_id,display_name,normalized_name) values
    (v_workspace,v_supervisor,'Vichitra ma''am','vichitra'),
    (v_workspace,v_aditya,'Aditya','aditya'),
    (v_workspace,v_tansi,'Tansi','tansi');

  select id into v_supervisor_volunteer from public.volunteers where workspace_id=v_workspace and normalized_name='vichitra';
  select id into v_aditya_volunteer from public.volunteers where workspace_id=v_workspace and normalized_name='aditya';
  select id into v_tansi_volunteer from public.volunteers where workspace_id=v_workspace and normalized_name='tansi';

  insert into public.memberships(workspace_id,user_id,role,volunteer_id) values
    (v_workspace,v_supervisor,'supervisor',v_supervisor_volunteer),
    (v_workspace,v_aditya,'worker',v_aditya_volunteer),
    (v_workspace,v_tansi,'worker',v_tansi_volunteer);
end
$$;
