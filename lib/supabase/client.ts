import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// This is a Supabase publishable key, intended for public client applications.
// RLS and Supabase Auth still enforce access. Never put a secret/service-role key here.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bbawqpgyolnifrqylifb.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'sb_publishable_wpj4pXOzjS-uIB8t18BllQ_WraM1Z40'

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
    )
  }
  return client
}
