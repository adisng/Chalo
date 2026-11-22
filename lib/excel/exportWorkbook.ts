import * as XLSX from 'xlsx'

type Volunteer = { id: string; displayName: string }
type Hostel = { id: string; code: string; name: string }
type Assignment = { volunteerId: string; hostelId: string; activeFrom?: string|null; activeTo?: string|null }
type PlannedVisit = { id: string; volunteerId: string; hostelId: string; date: string; plannedSessions: number[]; outcome: string }
type VisitLog = { id: string; volunteerId: string; hostelId: string; date: string; sessionsTaught: number[]; outcome: string; notes?: string }

export type WorkspaceExportData = {
  volunteers: Volunteer[]
  hostels: Hostel[]
  assignments: Assignment[]
  visits: PlannedVisit[]
  logs: VisitLog[]
}

export function buildWorkspaceWorkbook(data: WorkspaceExportData): XLSX.WorkBook {
  const volunteers = new Map(data.volunteers.map(item => [item.id, item.displayName]))
  const hostels = new Map(data.hostels.map(item => [item.id, item]))
  const rows = (list: Array<{ volunteerId: string; hostelId: string }>) => list.map(item => ({
    Volunteer: volunteers.get(item.volunteerId) || 'Unknown volunteer',
    Hostel: hostels.get(item.hostelId)?.code || 'Unknown hostel',
    HostelName: hostels.get(item.hostelId)?.name || '',
  }))

  const scheduleSheet = XLSX.utils.json_to_sheet(data.visits.map((visit, index) => ({
    Row: index + 1,
    ...rows([visit])[0],
    Date: visit.date,
    Sessions: (visit.plannedSessions || []).join(', '),
    Status: visit.outcome,
    PlannedVisitId: visit.id,
  })))
  const assignmentsSheet = XLSX.utils.json_to_sheet(data.assignments.map((assignment, index) => ({
    Row: index + 1,
    ...rows([assignment])[0],
    ActiveFrom: assignment.activeFrom || '',
    ActiveTo: assignment.activeTo || '',
  })))
  const progressSheet = XLSX.utils.json_to_sheet(data.logs.map((log, index) => ({
    Row: index + 1,
    ...rows([log])[0],
    Date: log.date,
    SessionsTaught: (log.sessionsTaught || []).join(', '),
    Outcome: log.outcome,
    Notes: log.notes || '',
    VisitLogId: log.id,
  })))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, scheduleSheet, 'Schedule')
  XLSX.utils.book_append_sheet(workbook, assignmentsSheet, 'Assignments')
  XLSX.utils.book_append_sheet(workbook, progressSheet, 'Progress')
  workbook.Props = { Title: 'Chalo Workspace Export', Subject: 'Schedule, assignments, and visit progress', CreatedDate: new Date() }
  return workbook
}

export function downloadWorkspaceWorkbook(data: WorkspaceExportData, filename = 'chalo-workspace.xlsx'): void {
  XLSX.writeFile(buildWorkspaceWorkbook(data), filename)
}
