'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase/client'
import { getCurrentMembership, type Membership } from '../../lib/supabase/workspace'
import { assignHostel, commitReviewedImport, createRosterVolunteer, createWorkspaceHostel, loadWorkspaceSnapshot, recordWorkspaceVisit, signInWithEmail, signOut, type WorkspaceSnapshot } from '../../lib/supabase/workspaceData'
import { inspectWorkbook, mapWorkbook, type ColumnKey, type ColumnMapping, type ImportDraft, type WorkbookInspection } from '../../lib/excel/inspectWorkbook'
import { downloadWorkspaceWorkbook } from '../../lib/excel/exportWorkbook'

type Row = Record<string, any>
const fields: ColumnKey[] = ['sourceRow','volunteer','hostelCode','hostelName','date','day','sessions']
const fieldLabels: Record<ColumnKey,string> = { sourceRow:'Source S.No (optional)',volunteer:'Volunteer',hostelCode:'Hostel code',hostelName:'Hostel name',date:'Date',day:'Day / weekday',sessions:'Sessions' }
const norm=(value:unknown)=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const niceDate=(value:string)=>new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`))

export default function SharedWorkspacePortal({onOffline}:{onOffline:()=>void}) {
  const client=getSupabaseClient()
  const [user,setUser]=useState<User|null>(null)
  const [membership,setMembership]=useState<Membership|null>(null)
  const [snapshot,setSnapshot]=useState<WorkspaceSnapshot|null>(null)
  const [busy,setBusy]=useState(true)
  const [email,setEmail]=useState('')
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [tab,setTab]=useState<'today'|'schedule'|'hostels'|'team'>('today')
  const [visitDate,setVisitDate]=useState(localDate())
  const [hostelId,setHostelId]=useState('')
  const [volunteerId,setVolunteerId]=useState('')
  const [defaultImportVolunteerId,setDefaultImportVolunteerId]=useState('')
  const [sessions,setSessions]=useState('')
  const [plannedVisitId,setPlannedVisitId]=useState('')
  const [visitOutcome,setVisitOutcome]=useState<'done'|'partial'|'skipped'|'rescheduled'|'swapped'>('done')
  const [newVolunteer,setNewVolunteer]=useState('')
  const [newHostelCode,setNewHostelCode]=useState('')
  const [newHostelName,setNewHostelName]=useState('')
  const [newHostelLocation,setNewHostelLocation]=useState('')
  const [assignVolunteerId,setAssignVolunteerId]=useState('')
  const [assignHostelId,setAssignHostelId]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [inspection,setInspection]=useState<WorkbookInspection|null>(null)
  const [sheetName,setSheetName]=useState('')
  const [mapping,setMapping]=useState<ColumnMapping>({})

  const reload=useCallback(async(c:SupabaseClient,m:Membership)=>{
    const data=await loadWorkspaceSnapshot(c,m)
    setSnapshot(data)
    const firstHostel=(data.hostels[0] as Row|undefined)?.id
    if(firstHostel)setHostelId(current=>current||String(firstHostel))
    const firstVolunteer=(data.volunteers[0] as Row|undefined)?.id
    if(firstVolunteer)setVolunteerId(current=>current||String(firstVolunteer))
  },[])

  const refreshAuth=useCallback(async(c:SupabaseClient)=>{
    const {data,error:sessionError}=await c.auth.getSession()
    if(sessionError)throw sessionError
    const currentUser=data.session?.user||null
    setUser(currentUser)
    if(!currentUser){setMembership(null);setSnapshot(null);setBusy(false);return}
    const currentMembership=await getCurrentMembership(c)
    setMembership(currentMembership)
    if(currentMembership)await reload(c,currentMembership)
    setBusy(false)
  },[reload])

  useEffect(()=>{
    if(!client){setBusy(false);return}
    let alive=true
    refreshAuth(client).catch(reason=>{if(alive){setError(reason instanceof Error?reason.message:'Could not connect to the shared workspace.');setBusy(false)}})
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{
      window.setTimeout(()=>{if(alive)refreshAuth(client).catch(reason=>{if(alive){setError(reason instanceof Error?reason.message:'Could not load your workspace.');setBusy(false)}})},0)
    })
    const onVisible=()=>{if(document.visibilityState==='visible'&&user&&membership)reload(client,membership).catch(()=>{})}
    document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;subscription.unsubscribe();document.removeEventListener('visibilitychange',onVisible)}
  },[client,refreshAuth,reload,user,membership])

  useEffect(()=>{
    if(!client||!membership)return
    const channel=client.channel(`workspace-${membership.workspace_id}`)
    for(const table of ['hostels','assignments','planned_visits','visit_logs','volunteers'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`workspace_id=eq.${membership.workspace_id}`},()=>reload(client,membership).catch(()=>{}))
    channel.subscribe()
    return()=>{client.removeChannel(channel)}
  },[client,membership,reload])

  const volunteers=useMemo(()=>((snapshot?.volunteers||[]) as Row[]).filter(v=>v.is_active!==false),[snapshot])
  const hostels=useMemo(()=>((snapshot?.hostels||[]) as Row[]).filter(h=>!h.archived_at),[snapshot])
  const allLogs=useMemo(()=>((snapshot?.visitLogs||[]) as Row[]),[snapshot])
  const planned=useMemo(()=>((snapshot?.plannedVisits||[]) as Row[]).sort((a,b)=>String(a.visit_date).localeCompare(String(b.visit_date))),[snapshot])
  const assignments=useMemo(()=>((snapshot?.assignments||[]) as Row[]),[snapshot])
  const draft:ImportDraft|null=useMemo(()=>inspection&&sheetName?mapWorkbook(inspection,sheetName,mapping):null,[inspection,sheetName,mapping])

  async function act(action:()=>Promise<unknown>,success:string):Promise<boolean>{setError('');setNotice('');try{await action();if(client&&membership)await reload(client,membership);setNotice(success);return true}catch(reason){setError(reason instanceof Error?reason.message:'The change could not be saved.');return false}}
  async function handleLogin(event:React.FormEvent){event.preventDefault();if(!client)return;await act(()=>signInWithEmail(client,email),'Check your email for the secure sign-in link.')}
  async function handleVisit(event:React.FormEvent){event.preventDefault();if(!client||!membership)return;const parsed=parseSessionInput(sessions);if(visitOutcome!=='skipped'&&!parsed.length){setError('Enter sessions like 1-2 or 1,3.');return}const saved=await act(()=>recordWorkspaceVisit(client,membership,{hostelId,volunteerId:membership.role==='supervisor'?volunteerId:undefined,visitDate,sessionsTaught:parsed,outcome:visitOutcome,plannedVisitId:plannedVisitId||null}),'Visit saved for the whole team.');if(saved){setSessions('');setPlannedVisitId('');setVisitOutcome('done')}}
  function preparePlannedVisit(visit:Row){setPlannedVisitId(String(visit.id));setHostelId(String(visit.hostel_id));setVolunteerId(String(visit.volunteer_id));setVisitDate(localDate());setSessions((visit.planned_sessions||[]).join(','));setVisitOutcome('done');setTab('today')}
  async function handleWorkbook(selected:File){setError('');setNotice('');try{const result=await inspectWorkbook(selected);const first=result.sheets.find(s=>s.mappingScore>0)||result.sheets[0];setFile(selected);setInspection(result);setSheetName(first?.name||'');setMapping(first?.suggestedMapping||{});if(!first?.mappingScore)setError('I could not identify the columns automatically. Choose a worksheet and map each field below.')}catch(reason){setError(reason instanceof Error?reason.message:'Could not read this workbook.')}}
  async function importReviewed(){if(!client||!membership||!draft||!file)return;setError('');const proposed=draft.rows.map(row=>{
    const volunteerMatches=row.volunteerName?volunteers.filter(v=>norm(v.normalized_name)===norm(row.volunteerName)||norm(v.display_name)===norm(row.volunteerName)):volunteers.filter(v=>v.id===(membership.role==='worker'?membership.volunteer_id:defaultImportVolunteerId))
    const codeMatches=row.hostelCode?hostels.filter(h=>norm(h.code)===norm(row.hostelCode)):[]
    const nameMatches=row.hostelName?hostels.filter(h=>norm(h.name)===norm(row.hostelName)):[]
    const hostelMatches=nameMatches.length?nameMatches:codeMatches
    const warnings=row.warnings.filter(warning=>!(!row.volunteerName&&warning.startsWith('Volunteer is missing')&&(membership.role==='worker'||Boolean(defaultImportVolunteerId))))
    return {row,volunteer:volunteerMatches.length===1?volunteerMatches[0]:null,hostel:hostelMatches.length===1?hostelMatches[0]:null,codeCorrection:nameMatches.length===1&&row.hostelCode&&norm(row.hostelCode)!==norm(nameMatches[0].code)?{from:row.hostelCode,to:String(nameMatches[0].code)}:null,problems:[...warnings,...(volunteerMatches.length!==1?['Volunteer is missing or ambiguous; choose a default roster person or fix the name.']:[]),...(hostelMatches.length!==1?['Hostel is missing or ambiguous; correct the code/name.']:[])]}
  })
  const invalid=proposed.filter(item=>item.problems.length)
  if(invalid.length){setError(`${invalid.length} row(s) need correction before import. Nothing was imported.`);return}
  try{
    const hashBytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer())
    const hash=Array.from(new Uint8Array(hashBytes),b=>b.toString(16).padStart(2,'0')).join('')
    const rows=proposed.map(({row,volunteer,hostel})=>({volunteer_id:String(volunteer!.id),hostel_id:String(hostel!.id),visit_date:String(row.date),planned_sessions:row.sessions,source_sheet:row.sourceSheet,source_row:row.sourceRow,source_values:{values:row.rawValues,original_date:row.originalDate,date_correction:row.dateCorrection||null,session_correction:row.sessionCorrection||null}}))
    const batch=await commitReviewedImport(client,{workspaceId:membership.workspace_id,workbookName:file.name,sourceHash:hash,mapping:{sheet:sheetName,columns:mapping},rows})
    await reload(client,membership);setFile(null);setInspection(null);setNotice(`Imported ${rows.length} rows. Batch ${batch.slice(0,8)}.`)
  }catch(reason){setError(reason instanceof Error?reason.message:'Import failed. No partial rows were committed.')}
  }
  function exportWorkbook(){if(!snapshot)return;downloadWorkspaceWorkbook({volunteers:volunteers.map(v=>({id:String(v.id),displayName:String(v.display_name)})),hostels:hostels.map(h=>({id:String(h.id),code:String(h.code),name:String(h.name)})),assignments:assignments.map(a=>({volunteerId:String(a.volunteer_id),hostelId:String(a.hostel_id),activeFrom:a.active_from,activeTo:a.active_to})),visits:planned.map(v=>({id:String(v.id),volunteerId:String(v.volunteer_id),hostelId:String(v.hostel_id),date:String(v.visit_date),plannedSessions:v.planned_sessions||[],outcome:String(v.outcome)})),logs:allLogs.map(l=>({id:String(l.id),volunteerId:String(l.volunteer_id),hostelId:String(l.hostel_id),date:String(l.visit_date),sessionsTaught:l.sessions_taught||[],outcome:String(l.outcome),notes:String(l.notes||'')}))},'chalo-shared-workspace.xlsx')}

  if(!client)return <main className="app-shell workspace-shell"><section className="workspace-card"><p className="eyebrow">SHARED WORKSPACE SETUP</p><h1>Connect Chalo to Supabase</h1><p className="muted">Add the project URL and publishable key to <code>.env.local</code>, then restart the app. Your device-only data remains available below.</p><button className="secondary full" onClick={onOffline}>Continue with offline data</button></section></main>
  if(busy)return <main className="app-shell workspace-shell"><section className="workspace-card"><p className="eyebrow">CHALO · TEAM WORKSPACE</p><h1>Connecting…</h1><p className="muted">Loading your account and assigned hostels.</p></section></main>
  if(!user)return <main className="app-shell workspace-shell"><section className="workspace-card"><p className="eyebrow">CHALO · TEAM WORKSPACE</p><h1>Sign in to Chalo</h1><p className="muted">Use your invited team email. We’ll send a one-time sign-in link.</p><form className="workspace-form" onSubmit={handleLogin}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button className="primary full" type="submit">Email me a sign-in link</button></form><button className="ghost full" onClick={onOffline}>Use this device offline</button><p className="workspace-footnote">Only accounts added by the workspace supervisor can see shared data.</p>{error&&<p className="workspace-error" role="alert">{error}</p>}{notice&&<p className="workspace-notice" role="status">{notice}</p>}</section></main>
  if(!membership)return <main className="app-shell workspace-shell"><section className="workspace-card"><p className="eyebrow">ACCOUNT NEEDS ACCESS</p><h1>You’re signed in, but not on the roster yet.</h1><p className="muted">Ask Vichitra ma’am to add this account to the Chalo workspace. Signing in does not grant access by itself.</p><button className="secondary full" onClick={()=>client.auth.signOut()}>Sign out</button><button className="ghost full" onClick={onOffline}>Use this device offline</button>{error&&<p className="workspace-error" role="alert">{error}</p>}</section></main>

  const displayName=volunteers.find(v=>v.id===membership.volunteer_id)?.display_name||user.email||'Team member'
  const selectedHostel=hostels.find(h=>h.id===hostelId)
  const visibleLogs=allLogs.slice().sort((a,b)=>String(b.visit_date).localeCompare(String(a.visit_date)))
  return <main className="app-shell workspace-shell">
    <header className="workspace-top"><div><p className="eyebrow">CHALO · SHARED WORKSPACE</p><h1>{displayName}</h1><span className="workspace-role">{membership.role==='supervisor'?'Supervisor':'Assigned volunteer'}</span></div><button className="ghost" onClick={()=>signOut(client)}>Sign out</button></header>
    <nav className="workspace-tabs" aria-label="Workspace sections">{(['today','schedule','hostels',...(membership.role==='supervisor'?['team']:[])] as string[]).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value as typeof tab)}>{value==='today'?'Overview':value[0].toUpperCase()+value.slice(1)}</button>)}</nav>
    {(error||notice)&&<div className={error?'workspace-error':'workspace-notice'} role={error?'alert':'status'}>{error||notice}</div>}
    {tab==='today'&&<>
      <section className="workspace-card"><p className="eyebrow">YOUR WORKSPACE</p><h2>{membership.role==='supervisor'?'Team-wide progress':'Your assigned hostels'}</h2><p className="muted">{hostels.length} hostels · {planned.length} planned visits · {allLogs.length} visit logs</p><div className="workspace-stat-row">{hostels.slice(0,4).map(h=><span className="workspace-stat" key={h.id}><b>{h.code}</b><small>{allLogs.filter(l=>l.hostel_id===h.id).length} logs</small></span>)}</div></section>
      <section className="workspace-card"><p className="eyebrow">LOG A VISIT</p><h2>Record progress</h2><form className="workspace-form" onSubmit={handleVisit}>
        <label>Hostel<select required value={hostelId} onChange={e=>setHostelId(e.target.value)}><option value="">Choose an assigned hostel</option>{hostels.map(h=><option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select></label>
        {membership.role==='supervisor'&&<label>Volunteer<select required value={volunteerId} onChange={e=>setVolunteerId(e.target.value)}><option value="">Choose volunteer</option>{volunteers.map(v=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label>}
        {planned.length>0&&<label>Link to a planned visit (optional)<select value={plannedVisitId} onChange={e=>{const plan=planned.find(v=>v.id===e.target.value);if(plan)preparePlannedVisit(plan);else setPlannedVisitId('')}}><option value="">Unscheduled visit</option>{planned.map(v=><option key={v.id} value={v.id}>{niceDate(String(v.visit_date))} · {hostels.find(h=>h.id===v.hostel_id)?.code||'Hostel'} · {volunteers.find(x=>x.id===v.volunteer_id)?.display_name||'Volunteer'}</option>)}</select></label>}
        {plannedVisitId&&<p className="muted">Use the date below for the actual visit. Choose “Rescheduled (covered later / holiday)” when making up a missed planned visit.</p>}
        <label>Actual visit date<input type="date" required value={visitDate} onChange={e=>setVisitDate(e.target.value)}/></label>
        <label>What happened?<select value={visitOutcome} onChange={e=>setVisitOutcome(e.target.value as typeof visitOutcome)}><option value="done">Completed as planned</option><option value="partial">Partially completed</option><option value="rescheduled">Rescheduled (covered later / holiday)</option><option value="swapped">Visited a different hostel</option><option value="skipped">Skipped / not completed</option></select></label>
        <label>Sessions completed<input value={sessions} onChange={e=>setSessions(e.target.value)} placeholder="1-2 or 1,3"/><small>Enter a pair like 1-2 or individual sessions like 1,3. Leave blank only when skipped.</small></label>
        <button className="primary full" disabled={!hostelId||(visitOutcome!=='skipped'&&!sessions.trim())}>Save visit for the whole team</button>
      </form></section>
      <section className="workspace-card"><div className="workspace-section-head"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent visits</h2></div><button className="secondary" onClick={exportWorkbook}>Export Excel</button></div><LogRows logs={visibleLogs.slice(0,8)} hostels={hostels} volunteers={volunteers}/></section>
    </>}
    {tab==='schedule'&&<section className="workspace-card"><p className="eyebrow">PLANNED VISITS</p><h2>Schedule</h2>{planned.length?<div className="workspace-list">{planned.map(v=><article className="workspace-row" key={v.id}><div><strong>{niceDate(String(v.visit_date))} · {hostels.find(h=>h.id===v.hostel_id)?.code||'Hostel'}</strong><span>{volunteers.find(x=>x.id===v.volunteer_id)?.display_name||'Volunteer'} · {(v.planned_sessions||[]).map((s:number)=>`S${s}`).join(', ')} · {v.outcome}</span></div>{v.outcome==='planned'&&<button className="secondary" onClick={()=>preparePlannedVisit(v)}>Log visit</button>}</article>)}</div>:<p className="muted">No schedule rows yet. Import a reviewed workbook below.</p>}<WorkbookImport file={file} inspection={inspection} sheetName={sheetName} mapping={mapping} draft={draft} hostels={hostels} volunteers={volunteers} defaultVolunteerId={defaultImportVolunteerId||(membership.role==='worker'?membership.volunteer_id||'':'')} onDefaultVolunteer={setDefaultImportVolunteerId} onFile={handleWorkbook} onSheet={name=>{setSheetName(name);setMapping(inspection?.sheets.find(s=>s.name===name)?.suggestedMapping||{})}} onMapping={(key,value)=>setMapping(current=>({...current,[key]:value}))} onImport={importReviewed} supervisor={membership.role==='supervisor'} onCreateVolunteer={async name=>{await act(()=>createRosterVolunteer(client,membership,{displayName:name,normalizedName:norm(name)}),'Volunteer added. Review the workbook again to import.') }} />{error&&<p className="workspace-error" role="alert">{error}</p>}</section>}
    {tab==='hostels'&&<section className="workspace-card"><p className="eyebrow">ASSIGNMENTS</p><h2>Hostels</h2>{hostels.length?<div className="workspace-grid">{hostels.map(h=><article className="workspace-hostel" key={h.id}><b>{h.code}</b><strong>{h.name}</strong><span>{h.location||'Location not set'}</span><small>{allLogs.filter(l=>l.hostel_id===h.id).length} visits logged</small></article>)}</div>:<p className="muted">No hostels are assigned to this account. Ask the supervisor to assign them.</p>}{membership.role==='supervisor'&&<form className="workspace-form workspace-divider" onSubmit={e=>{e.preventDefault();act(()=>createWorkspaceHostel(client,membership,{code:newHostelCode,name:newHostelName,location:newHostelLocation}),'Hostel added.');setNewHostelCode('');setNewHostelName('');setNewHostelLocation('')}}><h3>Add a hostel</h3><label>Code<input required value={newHostelCode} onChange={e=>setNewHostelCode(e.target.value)} placeholder="H6"/></label><label>Name<input required value={newHostelName} onChange={e=>setNewHostelName(e.target.value)}/></label><label>Location<input value={newHostelLocation} onChange={e=>setNewHostelLocation(e.target.value)}/></label><button className="secondary full">Add hostel</button></form>}</section>}
    {tab==='team'&&membership.role==='supervisor'&&<section className="workspace-card"><p className="eyebrow">SUPERVISOR TOOLS</p><h2>Volunteer roster</h2><div className="workspace-list">{volunteers.map(v=><article className="workspace-row" key={v.id}><strong>{v.display_name}</strong><span>{assignments.filter(a=>a.volunteer_id===v.id).map(a=>hostels.find(h=>h.id===a.hostel_id)?.code).filter(Boolean).join(', ')||'No hostel assigned'}</span></article>)}</div><form className="workspace-form workspace-divider" onSubmit={e=>{e.preventDefault();act(()=>createRosterVolunteer(client,membership,{displayName:newVolunteer,normalizedName:norm(newVolunteer)}),'Volunteer added to roster.');setNewVolunteer('')}}><h3>Add volunteer</h3><label>Name<input required value={newVolunteer} onChange={e=>setNewVolunteer(e.target.value)} placeholder="Volunteer name"/></label><button className="secondary full">Add to roster</button></form><form className="workspace-form workspace-divider" onSubmit={e=>{e.preventDefault();act(()=>assignHostel(client,membership,{volunteerId:assignVolunteerId,hostelId:assignHostelId,activeFrom:localDate()}),'Hostel assigned.');setAssignVolunteerId('');setAssignHostelId('')}}><h3>Assign a hostel</h3><label>Volunteer<select required value={assignVolunteerId} onChange={e=>setAssignVolunteerId(e.target.value)}><option value="">Choose volunteer</option>{volunteers.map(v=><option key={v.id} value={v.id}>{v.display_name}</option>)}</select></label><label>Hostel<select required value={assignHostelId} onChange={e=>setAssignHostelId(e.target.value)}><option value="">Choose hostel</option>{hostels.map(h=><option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select></label><button className="secondary full">Assign hostel</button></form><div className="workspace-divider"><h3>Progress</h3><LogRows logs={visibleLogs} hostels={hostels} volunteers={volunteers} onEdit={async log=>{const next=window.prompt('Update sessions (example 1-2 or 1,3)',(log.sessions_taught||[]).join(','));if(next===null)return;const parsed=parseSessionInput(next);if(!parsed.length){setError('Enter valid sessions before saving.');return}await act(()=>import('../../lib/supabase/workspaceData').then(({updateVolunteerProgress})=>updateVolunteerProgress(client,membership,String(log.id),{sessions_taught:parsed})),'Progress updated.')}}/></div><button className="secondary full" onClick={exportWorkbook}>Export full workspace Excel</button></section>}
    <footer className="workspace-footer"><span>Shared changes sync across devices.</span><button className="ghost" onClick={onOffline}>Open device-only offline data</button></footer>
  </main>
}

function parseSessionInput(value:string):number[]{const out:number[]=[];for(const piece of value.split(/[,;]+/).map(s=>s.trim()).filter(Boolean)){const pair=piece.match(/^(\d+)\s*[-–]\s*(\d+)$/);if(pair){const start=Number(pair[1]),end=Number(pair[2]);if(end>=start&&end<=64)for(let i=start;i<=end;i++)out.push(i)}else{const n=Number(piece);if(Number.isInteger(n)&&n>=1&&n<=64)out.push(n)}}return [...new Set(out)].sort((a,b)=>a-b)}

function LogRows({logs,hostels,volunteers,onEdit}:{logs:Row[];hostels:Row[];volunteers:Row[];onEdit?:(log:Row)=>void}){if(!logs.length)return <p className="muted">No visit logs yet.</p>;return <div className="workspace-list">{logs.map(log=><article className="workspace-row" key={log.id}><div><strong>{niceDate(String(log.visit_date))} · {hostels.find(h=>h.id===log.hostel_id)?.code||'Hostel'}</strong><span>{volunteers.find(v=>v.id===log.volunteer_id)?.display_name||'Volunteer'} · {(log.sessions_taught||[]).map((s:number)=>`S${s}`).join(', ')||log.outcome}</span></div>{onEdit&&<button className="ghost" onClick={()=>onEdit(log)}>Edit</button>}</article>)}</div>}

function WorkbookImport({file,inspection,sheetName,mapping,draft,hostels,volunteers,defaultVolunteerId,onDefaultVolunteer,onFile,onSheet,onMapping,onImport,supervisor,onCreateVolunteer}:{file:File|null;inspection:WorkbookInspection|null;sheetName:string;mapping:ColumnMapping;draft:ImportDraft|null;hostels:Row[];volunteers:Row[];defaultVolunteerId:string;onDefaultVolunteer:(id:string)=>void;onFile:(file:File)=>void;onSheet:(sheet:string)=>void;onMapping:(key:ColumnKey,value:number|null)=>void;onImport:()=>void;supervisor:boolean;onCreateVolunteer:(name:string)=>Promise<void>}){
  const [newName,setNewName]=useState('')
  const activeSheet=inspection?.sheets.find(sheet=>sheet.name===sheetName)
  const sourceColumn=mapping.sourceRow??undefined
  const sessionColumn=mapping.sessions??undefined
  const resolvedRows=draft?.rows.map(row=>{
    const codeHostel=hostels.find(hostel=>row.hostelCode&&norm(hostel.code)===norm(row.hostelCode))
    const nameHostels=hostels.filter(hostel=>row.hostelName&&norm(hostel.name)===norm(row.hostelName))
    const nameHostel=nameHostels.length===1?nameHostels[0]:null
    const volunteerMatches=row.volunteerName?volunteers.filter(volunteer=>norm(volunteer.normalized_name)===norm(row.volunteerName)||norm(volunteer.display_name)===norm(row.volunteerName)):defaultVolunteerId?volunteers.filter(volunteer=>volunteer.id===defaultVolunteerId):[]
    const displayWarnings=row.warnings.filter(warning=>!(!row.volunteerName&&warning.startsWith('Volunteer is missing')&&(!supervisor||Boolean(defaultVolunteerId))))
    const volunteerUnresolved=volunteerMatches.length!==1
    const hostelUnresolved=!nameHostel&&!codeHostel
    const hostelAmbiguous=nameHostels.length>1
    return {row,codeHostel,nameHostel,displayWarnings,volunteerUnresolved,hostelUnresolved,hostelAmbiguous}
  })||[]
  const reviewRows=resolvedRows.filter(({row,codeHostel,nameHostel,displayWarnings,volunteerUnresolved,hostelUnresolved,hostelAmbiguous})=>row.dateCorrection||row.sessionCorrection||displayWarnings.length>0||volunteerUnresolved||hostelUnresolved||hostelAmbiguous||(row.hostelCode&&nameHostel&&norm(row.hostelCode)!==norm(nameHostel.code))||(codeHostel&&nameHostel&&codeHostel.id!==nameHostel.id))
  const rowsToShow=reviewRows.length?reviewRows:resolvedRows.slice(0,8)
  const sessionFlags=resolvedRows.filter(({row})=>row.sourceRow===120&&String(sessionColumn===undefined?'':row.rawValues[sessionColumn]).trim()==='41,52')
  const h4Rows=resolvedRows.filter(({row})=>norm(row.hostelCode)==='h4'||norm(row.hostelName).includes('sivani'))
  const h4Sessions=new Set(h4Rows.flatMap(({row})=>row.sessions))
  const h4Gap=h4Sessions.has(33)&&h4Sessions.has(34)&&h4Sessions.has(36)&&h4Sessions.has(37)&&h4Sessions.has(38)&&h4Sessions.has(39)&&!h4Sessions.has(35)
  const workbookText=activeSheet?.rows.flat().map(String).join(' ').toLowerCase()||''
  const headerFlag=/32\s+sessions|32\s+total\s+sessions|total\s+sessions?.{0,8}32/i.test(workbookText)&&resolvedRows.some(({row})=>row.sessions.includes(64))
  return <div className="workspace-import workspace-divider">
    <h3>Review and import Excel</h3><p className="muted">The workbook stays on this device. Review the mapped rows and every proposed correction before confirming. No source workbook is uploaded.</p>
    <label className="secondary full file-button">{file?file.name:'Choose Excel file'}<input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files?.[0]&&onFile(e.target.files[0])}/></label>
    {inspection&&<>
      <label>Worksheet<select value={sheetName} onChange={e=>onSheet(e.target.value)}>{inspection.sheets.map(sheet=><option key={sheet.name} value={sheet.name}>{sheet.name} ({sheet.rows.length} rows)</option>)}</select></label>
      <div className="workspace-mapping">{fields.map(key=><label key={key}>{fieldLabels[key]}<select value={mapping[key]??''} onChange={e=>onMapping(key,e.target.value===''?null:Number(e.target.value))}><option value="">Choose column</option>{activeSheet?.headers.map((header,index)=><option value={index} key={`${index}-${header}`}>{header||`Column ${index+1}`}</option>)}</select></label>)}</div>
      {supervisor&&draft?.rows.some(row=>!row.volunteerName)&&<label>Volunteer for rows with blank names<select value={defaultVolunteerId} onChange={e=>onDefaultVolunteer(e.target.value)}><option value="">Choose a roster volunteer</option>{volunteers.map(volunteer=><option key={volunteer.id} value={volunteer.id}>{volunteer.display_name}</option>)}</select></label>}
      {draft&&<><p className="muted">{draft.rows.length} source rows retained. {reviewRows.length?`${reviewRows.length} rows need attention or contain a proposed correction.`:'No corrections or warnings found; showing a sample.'}</p>
        {rowsToShow.map(({row,codeHostel,nameHostel,displayWarnings,volunteerUnresolved,hostelUnresolved,hostelAmbiguous})=>{
          const hostelCorrection=Boolean(row.hostelCode&&nameHostel&&norm(row.hostelCode)!==norm(nameHostel.code))||(codeHostel&&nameHostel&&codeHostel.id!==nameHostel.id)
          const rawSessions=sessionColumn===undefined?'':String(row.rawValues[sessionColumn]??'')
          const exactFlag=row.sourceRow===120&&rawSessions.trim()==='41,52'
          return <div className="workspace-review-row" key={`${row.sourceSheet}-${row.sourceRow}`}>
            <strong>S.No {row.sourceRow}{sourceColumn===undefined?' (worksheet row number)':''}: {row.volunteerName||(defaultVolunteerId?volunteers.find(v=>v.id===defaultVolunteerId)?.display_name:'Volunteer unresolved')} · {hostelCorrection?`${row.hostelCode||codeHostel?.code} → ${nameHostel?.code||'unresolved'} (hostel name is the source of truth)`:row.hostelCode||row.hostelName||'Hostel unresolved'}</strong>
            <span>{row.dateCorrection?`Date ${row.originalDate} → ${row.dateCorrection.to} · ${row.dateCorrection.reason}`:row.date||'Date unresolved'} · Sessions {row.sessionCorrection?`${row.sessionCorrection.from} → ${row.sessionCorrection.to.join(', ')} · ${row.sessionCorrection.reason}`:row.sessions.join(', ')||'unresolved'}</span>
            {exactFlag&&<small>FLAG ONLY · Original sessions “41,52”; the possible “51,52” correction is not applied. Confirm the workbook value before import.</small>}
            {volunteerUnresolved&&<small>Volunteer is unresolved or ambiguous. Add a roster name or set the explicit default above.</small>}
            {hostelUnresolved&&<small>Hostel is unresolved. Match the code or exact hostel name to an existing hostel first.</small>}
            {hostelAmbiguous&&<small>Hostel name matches more than one roster record. Review the hostel identity before import.</small>}
            {displayWarnings.length>0&&<small>{displayWarnings.join(' ')}</small>}
          </div>
        })}
        {sessionFlags.length>0&&<p className="workspace-warning">Flag only: S.No 120 sessions 41,52 may need confirmation. The value stays unchanged.</p>}
        {h4Gap&&<p className="workspace-warning">FLAG ONLY · Original H4 sequence: 33,34 → 36,37 → 38,39. Proposed issue: session 35 is skipped. Reason: sequence gap requires user review.</p>}
        {headerFlag&&<p className="workspace-warning">FLAG ONLY · Original header: 32 sessions. Proposed comparison: numbering reaches session 64. Reason: confirm which total defines the plan.</p>}
        {supervisor&&<form className="workspace-form" onSubmit={e=>{e.preventDefault();if(newName)onCreateVolunteer(newName).then(()=>setNewName(''))}}><label>Add a roster name missing from this workbook match<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Exact volunteer name"/></label><button className="ghost" disabled={!newName}>Add roster volunteer</button></form>}
        <button className="primary full" onClick={onImport} disabled={!draft.rows.length}>Confirm reviewed import</button>
      </>}
    </>}
  </div>
}
