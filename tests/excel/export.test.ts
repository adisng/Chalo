import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkspaceWorkbook } from '../../lib/excel/exportWorkbook'

describe('buildWorkspaceWorkbook', () => {
  it('exports schedule, assignments, and progress rows to separate sheets', () => {
    const workbook = buildWorkspaceWorkbook({
      volunteers: [{ id: 'v1', displayName: 'Aditya' }],
      hostels: [{ id: 'h1', code: 'H1', name: 'Hostel One' }],
      assignments: [{ volunteerId: 'v1', hostelId: 'h1', activeFrom: '2026-11-01', activeTo: null }],
      visits: [{ id: 'p1', volunteerId: 'v1', hostelId: 'h1', date: '2026-11-02', plannedSessions: [3, 4], outcome: 'planned' }],
      logs: [{ id: 'l1', volunteerId: 'v1', hostelId: 'h1', date: '2026-11-02', sessionsTaught: [3, 4], outcome: 'done' }],
    })
    expect(workbook.SheetNames).toEqual(['Schedule', 'Assignments', 'Progress'])
    const schedule = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Schedule)
    const assignments = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Assignments)
    const progress = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Progress)
    expect(schedule[0]).toMatchObject({ Volunteer: 'Aditya', Hostel: 'H1', Date: '2026-11-02', Sessions: '3, 4' })
    expect(assignments[0]).toMatchObject({ Volunteer: 'Aditya', Hostel: 'H1', ActiveFrom: '2026-11-01' })
    expect(progress[0]).toMatchObject({ Volunteer: 'Aditya', Hostel: 'H1', Date: '2026-11-02', SessionsTaught: '3, 4' })
  })
})
