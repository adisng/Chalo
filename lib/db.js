import Dexie from 'dexie'

export const COUNSELOR_ID = 'counselor-default'
export const SCHEMA_VERSION = 2
export const db = new Dexie('step-up-field-log')
db.version(1).stores({ counselors: 'id', hostels: 'id, counselorId, code', plannedVisits: 'id, counselorId, date, hostelId, outcome', visitLogs: 'id, counselorId, date, hostelId, plannedVisitId, deletedAt', sessionStatus: '[counselorId+hostelId+sessionNo], counselorId, hostelId, status', milestones: 'id, counselorId, hostelId', tasks: 'id, counselorId, done', meta: 'key' })
db.version(2).stores({ counselors: 'id', hostels: 'id, counselorId, code, archivedAt', plannedVisits: 'id, counselorId, date, hostelId, outcome', visitLogs: 'id, counselorId, date, hostelId, plannedVisitId, deletedAt', sessionStatus: '[counselorId+hostelId+sessionNo], counselorId, hostelId, status', milestones: 'id, counselorId, hostelId', tasks: 'id, counselorId, done, deletedAt', meta: 'key' })

const now = () => new Date().toISOString()
const active = row => !row.deletedAt
function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('chalo:data-changed'))
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('chalo-data'); channel.postMessage({ changedAt: Date.now() }); channel.close() }
}
export async function seedCounselor() { await db.counselors.put({ id: COUNSELOR_ID, name: 'Aditya', updatedAt: now() }) }
export async function initializeStorage() {
  await seedCounselor()
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  await db.visitLogs.where('deletedAt').below(cutoff).delete().catch(() => {})
  const planned = await db.plannedVisits.where('counselorId').equals(COUNSELOR_ID).toArray()
  await db.transaction('rw', db.plannedVisits, db.visitLogs, async () => { for (const visit of planned.filter(item => item.outcome !== 'planned')) { const activeLog = await db.visitLogs.where('plannedVisitId').equals(visit.id).filter(active).count(); if (!activeLog) await db.plannedVisits.update(visit.id, { outcome: 'planned', actualHostelId: null, updatedAt: now() }) } })
  let persisted = null
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) persisted = await navigator.storage.persist().catch(() => false)
  return { persisted }
}
export async function getHostelProgress() {
  const hostels = await db.hostels.where('counselorId').equals(COUNSELOR_ID).toArray()
  const [logs, overrides] = await Promise.all([db.visitLogs.where('counselorId').equals(COUNSELOR_ID).toArray(), db.sessionStatus.where('counselorId').equals(COUNSELOR_ID).toArray()])
  const derived = new Map()
  for (const log of logs.filter(active)) for (const sessionNo of log.sessionsTaught || []) derived.set(`${log.hostelId}:${sessionNo}`, { status: log.outcome === 'partial' ? 'partial' : 'done', date: log.date })
  for (const override of overrides) derived.set(`${override.hostelId}:${override.sessionNo}`, override)
  return hostels.filter(active).map(h => { const statuses = [...derived.entries()].filter(([key]) => key.startsWith(`${h.id}:`)).map(([, value]) => value.status); return { ...h, done: statuses.filter(s => s === 'done').length, partial: statuses.filter(s => s === 'partial').length, skipped: statuses.filter(s => s === 'skipped').length } })
}
export async function recordVisit({ date, hostelId, sessionsTaught = [], plannedVisitId, outcome = 'done as planned', notes = '', attendance = null, force = false }) {
  const existing = plannedVisitId && await db.visitLogs.where('plannedVisitId').equals(plannedVisitId).filter(active).first()
  if (existing && !force) throw new Error('This planned visit is already logged.')
  const timestamp = now(); const actual = { id: crypto.randomUUID(), counselorId: COUNSELOR_ID, date, hostelId, sessionsTaught, plannedVisitId: plannedVisitId || null, notes, attendance, outcome, createdAt: timestamp, updatedAt: timestamp }
  await db.transaction('rw', db.visitLogs, db.plannedVisits, async () => { await db.visitLogs.add(actual); if (plannedVisitId) await db.plannedVisits.update(plannedVisitId, { outcome, actualHostelId: hostelId, updatedAt: timestamp }) })
  announceChange(); return actual
}
export async function updateVisitLog(id, changes) { await db.visitLogs.update(id, { ...changes, updatedAt: now() }); announceChange() }
export async function deleteVisitLog(id) {
  const log = await db.visitLogs.get(id); if (!log) return
  const timestamp = now()
  await db.transaction('rw', db.visitLogs, db.plannedVisits, async () => {
    await db.visitLogs.update(id, { deletedAt: timestamp, updatedAt: timestamp })
    if (log.plannedVisitId) { const remaining = await db.visitLogs.where('plannedVisitId').equals(log.plannedVisitId).filter(item => active(item) && item.id !== id).count(); if (!remaining) await db.plannedVisits.update(log.plannedVisitId, { outcome: 'planned', actualHostelId: null, updatedAt: timestamp }) }
  })
  announceChange()
}
export async function deleteHostelLogs(hostelId) {
  const logs = await db.visitLogs.where('hostelId').equals(hostelId).filter(log => log.counselorId === COUNSELOR_ID && active(log)).toArray()
  const timestamp = now()
  await db.transaction('rw', db.visitLogs, db.plannedVisits, async () => { for (const log of logs) { await db.visitLogs.update(log.id, { deletedAt: timestamp, updatedAt: timestamp }); if (log.plannedVisitId) { const remaining = await db.visitLogs.where('plannedVisitId').equals(log.plannedVisitId).filter(item => active(item) && item.id !== log.id).count(); if (!remaining) await db.plannedVisits.update(log.plannedVisitId, { outcome: 'planned', actualHostelId: null, updatedAt: timestamp }) } } })
  announceChange(); return logs.length
}
export async function restoreVisitLog(id) { const log = await db.visitLogs.get(id); const timestamp = now(); await db.transaction('rw', db.visitLogs, db.plannedVisits, async () => { await db.visitLogs.update(id, { deletedAt: null, updatedAt: timestamp }); if (log?.plannedVisitId) await db.plannedVisits.update(log.plannedVisitId, { outcome: log.outcome || 'done as planned', actualHostelId: log.hostelId, updatedAt: timestamp }) }); announceChange() }
export async function removeVisit(plannedVisitId) { if (await db.plannedVisits.get(plannedVisitId)) await db.plannedVisits.delete(plannedVisitId) }
export async function setSessionOverride({ hostelId, sessionNo, status, note = '' }) { await db.sessionStatus.put({ counselorId: COUNSELOR_ID, hostelId, sessionNo, status, note, updatedAt: now() }) }
export async function backup() { const tables = ['counselors', 'hostels', 'plannedVisits', 'visitLogs', 'sessionStatus', 'milestones', 'tasks', 'meta']; const data = {}; for (const table of tables) data[table] = await db[table].toArray(); return JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportedAt: now(), data }, null, 2) }
function validateBackup(payload) { if (!payload || payload.schemaVersion !== SCHEMA_VERSION || !payload.data || typeof payload.data !== 'object') throw new Error('Unsupported or invalid backup file.'); for (const table of ['counselors', 'hostels', 'plannedVisits', 'visitLogs', 'sessionStatus', 'milestones', 'tasks', 'meta']) if (!Array.isArray(payload.data[table])) throw new Error(`Backup table is invalid: ${table}`) }
export async function restore(json) { const payload = typeof json === 'string' ? JSON.parse(json) : json; validateBackup(payload); await db.transaction('rw', db.tables, async () => { for (const table of db.tables) { await table.clear(); if (payload.data[table.name].length) await table.bulkAdd(payload.data[table.name]) } }) }
