import type Dexie from 'dexie'
import type { Table } from 'dexie'

export type LocalHostel = {
  id: string
  counselorId: string
  code: string
  name: string
  type: string
  location: string
  archivedAt?: string | null
  done?: number
  partial?: number
  skipped?: number
}

export type LocalVisit = {
  id: string
  counselorId: string
  date: string
  hostelId: string
  plannedSessions: number[]
  outcome: string
  sourceRow: number
  actualHostelId?: string | null
  updatedAt?: string
}

export type LocalLog = {
  id: string
  counselorId: string
  date: string
  hostelId: string
  sessionsTaught: number[]
  plannedVisitId?: string | null
  outcome?: string
  notes?: string
  deletedAt?: string | null
  updatedAt?: string
}

export type SessionOverride = {
  counselorId: string
  hostelId: string
  sessionNo: number
  status: string
  note?: string
  updatedAt?: string
}

export type RecordVisitInput = {
  date: string
  hostelId: string
  sessionsTaught?: number[]
  plannedVisitId?: string | null
  outcome?: string
  notes?: string
  attendance?: unknown
  force?: boolean
}

export const COUNSELOR_ID: string
export const SCHEMA_VERSION: number
export const db: Dexie & {
  counselors: Table<{id:string;name:string;updatedAt:string},string>
  hostels: Table<LocalHostel,string>
  plannedVisits: Table<LocalVisit,string>
  visitLogs: Table<LocalLog,string>
  sessionStatus: Table<SessionOverride,[string,string,number]>
  milestones: Table<Record<string,unknown>,string>
  tasks: Table<Record<string,unknown>,string>
  meta: Table<Record<string,unknown>,string>
}
export function seedCounselor(): Promise<void>
export function initializeStorage(): Promise<{persisted:boolean|null}>
export function getHostelProgress(): Promise<LocalHostel[]>
export function recordVisit(input:RecordVisitInput): Promise<LocalLog>
export function updateVisitLog(id:string,changes:Partial<LocalLog>): Promise<void>
export function deleteVisitLog(id:string): Promise<void>
export function deleteHostelLogs(hostelId:string): Promise<number>
export function restoreVisitLog(id:string): Promise<void>
export function removeVisit(plannedVisitId:string): Promise<void>
export function setSessionOverride(input:Omit<SessionOverride,'counselorId'|'updatedAt'>): Promise<void>
export function backup(): Promise<string>
export function restore(payload:string|unknown): Promise<void>
