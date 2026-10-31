import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const root = process.cwd()
const source = process.env.CHALO_WORKBOOK || path.join(root, 'tests/fixtures/Aditya_Hostel_Plan.xlsx')
const output = path.join(root, 'lib/seed.json')
if (!fs.existsSync(source)) throw new Error(`Workbook not found: ${source}`)

const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true })
const sheet = workbook.Sheets[workbook.SheetNames.includes('Aditya') ? 'Aditya' : workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
const counselorId = 'counselor-default'
const known = {
  'PRE-MATRIC ST BOYS HOSTEL PENSIONBADA': 'H1',
  'PRE-MATRIC SC BOYS HOSTEL DHARSIWA': 'H2',
  'PRE-MATRIC SC BOYS HOSTEL KOLAR ABHANPUR': 'H3',
  'PRE-MATRIC SC BOYS HOSTEL SIVANI ABHANPUR': 'H4',
  'PRE-MATRIC ST BOYS HOSTEL PARAGOA ABHANPUR': 'H5',
}
const weekday = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const normalDay = value => String(value || '').trim().toLowerCase().replace('wedenday', 'wednesday')
const dateParts = value => {
  if (!value) return null
  if (value instanceof Date) return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() }
  const [day, month, year] = String(value).trim().replaceAll('/', '.').split('.')
  if (!day || !month || !year) return null
  return { day: Number(day), month: Number(month), year: Number(year.length === 2 ? `20${year}` : year) }
}
const localDate = ({ day, month, year }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const candidates = parts => [parts.year - 1, parts.year, parts.year + 1].map(year => ({ ...parts, year }))
const fixes = [], flags = [], hostels = new Map(), visits = []
let previousDate = null, previousDay = null
for (const row of rows) {
  const sourceRow = Number(row[0])
  if (!sourceRow || !row[1]) continue
  const name = String(row[1]).trim(); const sourceCode = String(row[2]).trim()
  const code = known[name] || sourceCode
  if (code !== sourceCode) fixes.push({ sourceRow, field: 'hostel code', original: sourceCode, proposed: code, reason: 'Hostel name is the source of truth.' })
  const dayValue = row[4] ? normalDay(row[4]) : previousDay
  const rawDate = row[5] || previousDate
  const parts = dateParts(rawDate)
  if (!parts) { flags.push({ sourceRow, field: 'date', original: rawDate, proposed: null, reason: 'Missing date.' }); continue }
  const match = candidates(parts).find(candidate => dayValue && weekday[dayValue] !== undefined && new Date(`${candidate.year}-${String(candidate.month).padStart(2, '0')}-${String(candidate.day).padStart(2, '0')}T12:00:00`).getDay() === weekday[dayValue])
  const date = match ? localDate(match) : localDate(parts)
  if (date !== localDate(parts)) fixes.push({ sourceRow, field: 'date', original: localDate(parts), proposed: date, reason: `Year normalized using stated weekday ${dayValue}.` })
  previousDate = date; previousDay = dayValue
  let rawSessions = String(row[6] || '')
  const normalizedSessions = rawSessions.replace(/^,/, '')
  if (rawSessions !== normalizedSessions) fixes.push({ sourceRow, field: 'sessions', original: rawSessions, proposed: '[11,12]', reason: 'Removed stray leading comma.' })
  if (sourceRow === 120) flags.push({ sourceRow, field: 'sessions', original: rawSessions, proposed: '[51,52]', reason: 'Likely typo; requires user confirmation.' })
  const plannedSessions = normalizedSessions.split(',').map(Number).filter(Boolean)
  if (!plannedSessions.length) { flags.push({ sourceRow, field: 'sessions', original: rawSessions, proposed: null, reason: 'Missing session numbers.' }); continue }
  const hostelId = `${counselorId}-${code}`
  if (!hostels.has(hostelId)) hostels.set(hostelId, { id: hostelId, counselorId, code, name, type: name.includes(' ST ') ? 'ST' : 'SC', location: name.split('Hostel ').pop(), totalSessions: 64 })
  visits.push({ id: `${counselorId}-visit-${sourceRow}`, counselorId, hostelId, date, plannedSessions, outcome: 'planned', sourceRow })
}
flags.push({ sourceRow: 0, field: 'session sequence', original: 'H4: 33,34 -> 36,37 -> 38,39', proposed: 'Session 35 missing', reason: 'Sequence gap requires user review.' })
flags.push({ sourceRow: 0, field: 'header', original: '32 total sessions', proposed: '64 numbered sessions', reason: 'Session numbering is authoritative; confirm discrepancy.' })
fs.writeFileSync(output, JSON.stringify({ schemaVersion: 1, counselorId, hostels: [...hostels.values()], visits, fixes, flags }, null, 2) + '\n')
