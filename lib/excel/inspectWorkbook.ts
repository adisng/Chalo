import * as XLSX from 'xlsx'

export type ColumnKey = 'sourceRow'|'volunteer'|'hostelCode'|'hostelName'|'date'|'day'|'sessions'
export type ColumnMapping = Partial<Record<ColumnKey, number|null>>
export type InspectedSheet = {
  name: string
  rows: unknown[][]
  headerRowIndex: number
  headers: string[]
  sampleRows: Array<{ sourceRow: number; values: unknown[] }>
  suggestedMapping: ColumnMapping
  mappingScore: number
}
export type WorkbookInspection = { filename: string; sheets: InspectedSheet[] }
export type ImportDraftRow = {
  sourceSheet: string
  sourceRow: number
  rawValues: unknown[]
  volunteerName: string
  hostelCode: string
  hostelName: string
  date: string|null
  originalDate: string
  dateCorrection?: { from: string; to: string; reason: string }
  sessionCorrection?: { from: string; to: number[]; reason: string }
  sessions: number[]
  warnings: string[]
}
export type ImportDraft = { filename: string; sheet: string; mapping: ColumnMapping; rows: ImportDraftRow[] }

const aliases: Record<ColumnKey, string[]> = {
  sourceRow: ['s no','sno','serial no','serial number','serial','s no number'],
  volunteer: ['volunteer','volunteer name','staff','staff name','teacher','teacher name','counselor','counsellor','employee','person','assigned to'],
  hostelCode: ['hostel code','hostel number','hostel no','code','hostel id'],
  hostelName: ['hostel name','name of hostel','hostel','institution','school','location'],
  date: ['date','visit date','date of visit','scheduled date','day date'],
  day: ['day','weekday','week day'],
  sessions: ['sessions','session','session no','session nos','sessions covered','sessions taught','total sessions','session numbers'],
}
const normalizeHeader = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[_\-./]+/g,' ').replace(/\s+/g,' ').trim()
const headerScore = (header: string, key: ColumnKey) => {
  const normalized=normalizeHeader(header)
  return aliases[key].some(alias=>normalized===alias)?3:aliases[key].some(alias=>normalized.includes(alias))?1:0
}

function findHeader(rows: unknown[][]): { row: number; headers: string[]; mapping: ColumnMapping; score: number } {
	let best:{row:number;headers:string[];mapping:ColumnMapping;score:number}={row:0,headers:[],mapping:{},score:0}
  for(let rowIndex=0;rowIndex<Math.min(rows.length,40);rowIndex++) {
    const cells=rows[rowIndex]||[]
    const mapping:ColumnMapping={}; let score=0
    for(const key of Object.keys(aliases) as ColumnKey[]) {
      const matches=cells.map((cell,index)=>({index,score:headerScore(String(cell??''),key)})).filter(match=>match.score>0).sort((a,b)=>b.score-a.score)
      if(matches.length){mapping[key]=matches[0].index;score+=matches[0].score}
    }
    const hasHostel=mapping.hostelCode!==undefined||mapping.hostelName!==undefined
    if(hasHostel&&mapping.date!==undefined&&mapping.sessions!==undefined&&score>best.score) best={row:rowIndex,headers:cells.map(cell=>String(cell??'').trim()),mapping,score}
  }
  return best
}

export async function inspectWorkbook(file: File): Promise<WorkbookInspection> {
  // Keep Excel dates as serials and decode them explicitly below. This avoids
  // interpreting a date-only value in whichever timezone opened the workbook.
  const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false})
  const sheets=workbook.SheetNames.map(name=>{
    const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,defval:'',raw:true})
    const found=findHeader(rows)
    return {name,rows,headerRowIndex:found.row,headers:found.headers,sampleRows:rows.slice(found.row+1,found.row+6).map((values,index)=>({sourceRow:found.row+index+2,values})),suggestedMapping:found.mapping,mappingScore:found.score}
  }).sort((a,b)=>b.mappingScore-a.mappingScore)
  return {filename:file.name,sheets}
}

function parseDate(value: unknown): string|null {
  if(value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
  if(typeof value==='number') { const parsed=XLSX.SSF.parse_date_code(value); if(parsed) return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}` }
  const text=String(value??'').trim(); if(!text)return null
  const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`
  const dmy=text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if(!dmy)return null
  const year=Number(dmy[3].length===2?`20${dmy[3]}`:dmy[3]); const month=Number(dmy[2]); const day=Number(dmy[1]); const candidate=new Date(year,month-1,day)
  if(candidate.getFullYear()!==year||candidate.getMonth()!==month-1||candidate.getDate()!==day)return null
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
function parseSessions(value: unknown): number[] {
  const text=String(value??'').trim(); if(!text)return []
  const result:number[]=[]
  for(const token of text.replace(/\band\b/gi,',').split(/[,;|]+/).map(part=>part.trim()).filter(Boolean)) {
    const range=token.match(/^(\d+)\s*[-–]\s*(\d+)$/)
    if(range){const start=Number(range[1]),end=Number(range[2]);if(end>=start&&end-start<64)for(let number=start;number<=end;number++)if(number>=1&&number<=64)result.push(number);continue}
    const number=Number(token);if(Number.isInteger(number)&&number>=1&&number<=64)result.push(number)
  }
  return [...new Set(result)].sort((a,b)=>a-b)
}

export function mapWorkbook(inspection: WorkbookInspection, sheetName: string, mapping: ColumnMapping): ImportDraft {
  const sheet=inspection.sheets.find(item=>item.name===sheetName)
  if(!sheet)throw new Error(`Worksheet not found: ${sheetName}`)
  const rows:ImportDraftRow[]=[]
  let carriedDate:string|null=null
  let carriedWeekday=''
  for(let index=sheet.headerRowIndex+1;index<sheet.rows.length;index++) {
    const rawValues=sheet.rows[index]||[]
    if(rawValues.every(value=>String(value??'').trim()===''))continue
    const get=(key:ColumnKey)=>{const column=mapping[key];return column===undefined||column===null?'':rawValues[column]}
    const warnings:string[]=[]
    const volunteerName=String(get('volunteer')??'').trim()
    const hostelCode=String(get('hostelCode')??'').trim()
    const hostelName=String(get('hostelName')??'').trim()
    const rawDate=String(get('date')??'').trim()
    const originalDate=rawDate
    const mappedSourceRow=Number(String(get('sourceRow')??'').trim())
    const sourceRow=Number.isInteger(mappedSourceRow)&&mappedSourceRow>0?mappedSourceRow:index+1
    const weekday=String(get('day')??'').trim()||carriedWeekday
    let date: string | null = parseDate(get('date'))
    let dateCorrection:ImportDraftRow['dateCorrection']
    if(!rawDate&&carriedDate)date=carriedDate
    if(date&&weekday){
      const expected=weekdayNumber(weekday)
      if(expected!==null&&weekdayOf(date)!==expected&&rawDate){
        const [year,month,day]=date.split('-').map(Number) as [number,number,number]
        const alternatives: string[] = [year-2,year-1,year+1,year+2].map((y:number)=>`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`).filter((candidate:string)=>weekdayOf(candidate)===expected)
        alternatives.sort((a:string,b:string)=>Math.abs(Number(a.slice(0,4))-year)-Math.abs(Number(b.slice(0,4))-year))
        if(alternatives.length){const proposed=alternatives[0];dateCorrection={from:date,to:proposed,reason:`Date year adjusted to match the stated ${weekday}. Confirm before import.`};date=proposed}
      }
    }
    if(date)carriedDate=date
    if(weekday)carriedWeekday=normalizeWeekday(weekday)||weekday
    const rawSessions=String(get('sessions')??'').trim()
    const sessions=parseSessions(rawSessions)
    const sessionCorrection=rawSessions.startsWith(',')&&sessions.length?{from:rawSessions,to:sessions,reason:'Leading separator removed; confirm the cleaned session list.'}:undefined
    if(!volunteerName)warnings.push('Volunteer is missing; assign or resolve before import.')
    if(!hostelCode&&!hostelName)warnings.push('Hostel identity is missing.')
    if(!date)warnings.push('Date is missing or could not be interpreted.')
    if(!sessions.length)warnings.push('Sessions are missing or could not be interpreted.')
    rows.push({sourceSheet:sheet.name,sourceRow,rawValues,volunteerName,hostelCode,hostelName,date,originalDate,dateCorrection,sessionCorrection,sessions,warnings})
  }
  return {filename:inspection.filename,sheet:sheet.name,mapping,rows}
}

function normalizeWeekday(value:string):string|null {
  const text=value.trim().toLowerCase().replace(/[^a-z]/g,'')
  const aliases:Record<string,string>={mon:'monday',monday:'monday',tue:'tuesday',tues:'tuesday',tuesday:'tuesday',wed:'wednesday',wednesday:'wednesday',wedenday:'wednesday',thurs:'thursday',thu:'thursday',thursday:'thursday',fri:'friday',friday:'friday',sat:'saturday',saturday:'saturday',sun:'sunday',sunday:'sunday'}
  return aliases[text]||null
}
function weekdayNumber(value:string):number|null {const normalized=normalizeWeekday(value);if(!normalized)return null;return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(normalized)}
function weekdayOf(date:string):number {const [year,month,day]=date.split('-').map(Number);return new Date(Date.UTC(year,month-1,day)).getUTCDay()}
