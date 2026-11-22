import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { inspectWorkbook, mapWorkbook } from '../../lib/excel/inspectWorkbook'

function makeFile(rows: unknown[][]): File {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Visits')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([bytes], 'schedule.xlsx')
}

describe('flexible workbook mapping', () => {
  it('recognizes different header labels and retains flagged source rows', async () => {
    const file = makeFile([
      ['Volunteer Name', 'Hostel Code', 'Visit Date', 'Sessions Covered'],
      ['Aditya', 'H1', '2026-11-02', '3-4'],
      ['Tansi', 'H2', 'not a date', ''],
    ])
    const inspection = await inspectWorkbook(file)
    const sheet = inspection.sheets[0]
    expect(sheet.suggestedMapping).toMatchObject({ volunteer: 0, hostelCode: 1, date: 2, sessions: 3 })
    const draft = mapWorkbook(inspection, 'Visits', sheet.suggestedMapping)
    expect(draft.rows).toHaveLength(2)
    expect(draft.rows[0]).toMatchObject({ volunteerName: 'Aditya', hostelCode: 'H1', date: '2026-11-02', sessions: [3, 4] })
    expect(draft.rows[1].warnings.length).toBeGreaterThan(0)
    expect(draft.rows[1].sourceRow).toBe(3)
  })

  it('detects a header row beneath a workbook title and supports hostel names', async () => {
    const inspection = await inspectWorkbook(makeFile([
      ['Monthly field plan'],
      ['Staff', 'Institution', 'Date of Visit', 'Session Nos'],
      ['Vichitra', 'Central Hostel', '02.11.2026', '1, 2'],
    ]))
    const sheet = inspection.sheets[0]
    expect(sheet.headerRowIndex).toBe(1)
    expect(sheet.suggestedMapping).toMatchObject({ volunteer: 0, hostelName: 1, date: 2, sessions: 3 })
    const draft = mapWorkbook(inspection, 'Visits', sheet.suggestedMapping)
    expect(draft.rows[0].hostelName).toBe('Central Hostel')
  })

  it('uses the weekday to propose a year correction and carries blank day/date cells forward', async () => {
    const inspection = await inspectWorkbook(makeFile([
      ['Volunteer Name', 'Day', 'Hostel Code', 'Date', 'Sessions'],
      ['Aditya', 'Wedenday', 'H1', '04.11.2027', '1-2'],
      ['Aditya', '', 'H1', '', '3,4'],
    ]))
    const sheet = inspection.sheets[0]
    const draft = mapWorkbook(inspection, 'Visits', sheet.suggestedMapping)
    expect(draft.rows[0]).toMatchObject({ originalDate: '04.11.2027', date: '2026-11-04', dateCorrection: { from: '2027-11-04', to: '2026-11-04' } })
    expect(draft.rows[1]).toMatchObject({ date: '2026-11-04', sessions: [3,4] })
  })

  it('maps the source serial number and shows a leading-comma cleanup as a proposal', async () => {
    const inspection = await inspectWorkbook(makeFile([
      ['S.No','Volunteer','Hostel Code','Day','Date','Sessions'],
      [12,'Aditya','H1','Wednesday','04.11.2027',',11,12'],
    ]))
    const sheet = inspection.sheets[0]
    expect(sheet.suggestedMapping.sourceRow).toBe(0)
    const draft = mapWorkbook(inspection,'Visits',sheet.suggestedMapping)
    expect(draft.rows[0]).toMatchObject({sourceRow:12,sessions:[11,12],sessionCorrection:{from:',11,12',to:[11,12]}})
  })

  it('decodes Excel serial dates as date-only values independent of timezone', async () => {
    const excelDate = 46330
    const dateParts = XLSX.SSF.parse_date_code(excelDate)!
    const expected = `${dateParts.y}-${String(dateParts.m).padStart(2,'0')}-${String(dateParts.d).padStart(2,'0')}`
    const inspection = await inspectWorkbook(makeFile([
      ['Volunteer','Hostel Code','Date','Sessions'],
      ['Aditya','H1',excelDate, '1-2'],
    ]))
    const draft = mapWorkbook(inspection,'Visits',inspection.sheets[0].suggestedMapping)
    expect(draft.rows[0].date).toBe(expected)
  })
})
