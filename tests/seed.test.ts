import { describe, expect, it } from 'vitest'
import seed from '../lib/seed.json'

describe('bundled workbook seed', () => {
  it('contains every planned visit and uses local date-only values', () => {
    expect(seed.visits).toHaveLength(147)
    expect(seed.hostels.map(hostel => hostel.code).sort()).toEqual(['H1','H2','H3','H4','H5'])
    expect(seed.visits.map(visit => visit.sourceRow).sort((a,b)=>a-b)).toEqual(Array.from({length:147},(_,index)=>index+1))
    const dates=seed.visits.map(visit=>visit.date).sort()
    expect(dates[0]).toBe('2026-10-27')
    expect(dates.at(-1)).toBe('2027-02-14')
    expect(seed.visits.every(visit=>/^\d{4}-\d{2}-\d{2}$/.test(visit.date))).toBe(true)
  })

  it('keeps proposed fixes and unresolved flags separate for explicit review', () => {
    expect(seed.fixes).toContainEqual(expect.objectContaining({sourceRow:12,field:'date',original:'04.11.2027',proposed:'2026-11-04'}))
    expect(seed.fixes).toContainEqual(expect.objectContaining({sourceRow:15,field:'hostel code',original:'H3',proposed:'H2'}))
    expect(seed.fixes).toContainEqual(expect.objectContaining({sourceRow:21,field:'sessions',original:',11,12'}))
    expect(seed.fixes).toContainEqual(expect.objectContaining({sourceRow:147,field:'hostel code',original:'H3',proposed:'H2'}))
    expect(seed.fixes.filter(fix=>fix.field==='date'&&fix.proposed.startsWith('2027-01-'))).toHaveLength(5)
    expect(seed.flags).toContainEqual(expect.objectContaining({sourceRow:120,field:'sessions',original:'41,52'}))
    expect(seed.flags).toContainEqual(expect.objectContaining({field:'session sequence',proposed:'Session 35 missing'}))
    expect(seed.flags).toContainEqual(expect.objectContaining({field:'header',original:'32 total sessions'}))
    expect(seed.visits.find(visit=>visit.sourceRow===120)?.plannedSessions).toEqual([41,52])
    expect(seed.visits.find(visit=>visit.sourceRow===21)?.plannedSessions).toEqual([11,12])
  })
})
