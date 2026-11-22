import type { SupabaseClient } from '@supabase/supabase-js'
import type { Membership } from './workspace'
import { canManageWorkspace } from './workspace'

export type WorkspaceSnapshot = {
  volunteers: Record<string, unknown>[]
  hostels: Record<string, unknown>[]
  assignments: Record<string, unknown>[]
  plannedVisits: Record<string, unknown>[]
  visitLogs: Record<string, unknown>[]
}

async function checked<T>(request: PromiseLike<{data:T|null,error:{message:string}|null}>): Promise<T> {
  const {data,error}=await request
  if(error)throw new Error(error.message)
  return (data||[]) as T
}

export async function loadWorkspaceSnapshot(client:SupabaseClient,membership:Membership):Promise<WorkspaceSnapshot> {
  const scope=(table:string)=>client.from(table).select('*').eq('workspace_id',membership.workspace_id)
  const [volunteers,hostels,assignments,plannedVisits,visitLogs]=await Promise.all([
    checked<Record<string,unknown>[]>(scope('volunteers')),
    checked<Record<string,unknown>[]>(scope('hostels')),
    checked<Record<string,unknown>[]>(scope('assignments')),
    checked<Record<string,unknown>[]>(scope('planned_visits')),
    checked<Record<string,unknown>[]>(scope('visit_logs').is('deleted_at',null)),
  ])
  return {volunteers,hostels,assignments,plannedVisits,visitLogs}
}

export async function createRosterVolunteer(client:SupabaseClient,membership:Membership,input:{displayName:string;normalizedName:string}):Promise<Record<string,unknown>> {
  if(!canManageWorkspace(membership.role))throw new Error('Only the supervisor can add roster volunteers.')
  const data=await checked<Record<string,unknown>[]>(client.from('volunteers').insert({workspace_id:membership.workspace_id,display_name:input.displayName.trim(),normalized_name:input.normalizedName.trim().toLowerCase()}).select().single().then(({data,error})=>({data:data?[data]:null,error})))
  return data[0]
}

export async function assignHostel(client:SupabaseClient,membership:Membership,input:{volunteerId:string;hostelId:string;activeFrom?:string|null;activeTo?:string|null}):Promise<void> {
  if(!canManageWorkspace(membership.role))throw new Error('Only the supervisor can change hostel assignments.')
  const {error}=await client.from('assignments').insert({workspace_id:membership.workspace_id,volunteer_id:input.volunteerId,hostel_id:input.hostelId,active_from:input.activeFrom||null,active_to:input.activeTo||null})
  if(error)throw new Error(error.message)
}

export async function updateVolunteerProgress(client:SupabaseClient,membership:Membership,logId:string,changes:{visit_date?:string;sessions_taught?:number[];outcome?:'done'|'partial'|'skipped'|'rescheduled'|'swapped';notes?:string}):Promise<void> {
  if(!canManageWorkspace(membership.role))throw new Error('Only the supervisor can alter roster progress.')
  const {error}=await client.from('visit_logs').update({...changes,edited_by:membership.user_id,updated_at:new Date().toISOString()}).eq('workspace_id',membership.workspace_id).eq('id',logId)
  if(error)throw new Error(error.message)
}

export async function recordWorkspaceVisit(client:SupabaseClient,membership:Membership,input:{hostelId:string;visitDate:string;sessionsTaught:number[];outcome:'done'|'partial'|'skipped'|'rescheduled'|'swapped';notes?:string;plannedVisitId?:string|null;volunteerId?:string}):Promise<void> {
  const volunteerId=membership.role==='supervisor'?input.volunteerId:membership.volunteer_id
  if (!volunteerId) throw new Error('Choose or link a volunteer profile before recording progress.')
  const {error}=await client.from('visit_logs').insert({workspace_id:membership.workspace_id,volunteer_id:volunteerId,hostel_id:input.hostelId,visit_date:input.visitDate,sessions_taught:input.sessionsTaught,outcome:input.outcome,notes:input.notes||'',planned_visit_id:input.plannedVisitId||null,edited_by:membership.user_id})
  if(error)throw new Error(error.message)
}

export async function createWorkspaceHostel(client:SupabaseClient,membership:Membership,input:{code:string;name:string;location?:string;totalSessions?:number}):Promise<void> {
  if(!canManageWorkspace(membership.role))throw new Error('Only the supervisor can add hostels.')
  const {error}=await client.from('hostels').insert({workspace_id:membership.workspace_id,code:input.code.trim().toUpperCase(),name:input.name.trim(),location:input.location?.trim()||'',total_sessions:input.totalSessions||64})
  if(error)throw new Error(error.message)
}

export async function commitReviewedImport(client:SupabaseClient,input:{workspaceId:string;workbookName:string;sourceHash:string;mapping:unknown;rows:Array<{volunteer_id:string;hostel_id:string;visit_date:string;planned_sessions:number[];source_sheet:string;source_row:number;source_values:unknown}>}):Promise<string> {
  const {data,error}=await client.rpc('commit_workspace_import',{p_workspace_id:input.workspaceId,p_workbook_name:input.workbookName,p_source_hash:input.sourceHash,p_mapping_profile:input.mapping,p_rows:input.rows})
  if(error)throw new Error(error.message)
  if(typeof data!=='string')throw new Error('Import completed but the server did not return its batch ID.')
  return data
}

export async function signInWithEmail(client:SupabaseClient,email:string):Promise<void> {
  const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:typeof window==='undefined'?undefined:window.location.origin}})
  if(error)throw new Error(error.message)
}

export async function signOut(client:SupabaseClient):Promise<void> {
  const {error}=await client.auth.signOut()
  if(error)throw new Error(error.message)
}
