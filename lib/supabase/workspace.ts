import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkspaceRole = 'supervisor' | 'worker'
export type Membership = {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  volunteer_id: string | null
}

export async function getCurrentMembership(client: SupabaseClient): Promise<Membership | null> {
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!user) return null
  const { data, error } = await client
    .from('memberships')
    .select('id, workspace_id, user_id, role, volunteer_id')
    .eq('user_id', user.id)
    .limit(2)
  if (error) throw error
  if (!data?.length) return null
  if (data.length > 1) throw new Error('This account belongs to multiple workspaces; workspace switching is not configured yet.')
  return data[0] as Membership
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === 'supervisor'
}
