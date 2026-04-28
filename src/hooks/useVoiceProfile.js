import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useVoiceProfiles(workspaceId) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!supabase || !workspaceId) return
    setLoading(true)
    const { data } = await supabase
      .from('voice_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('persona_name', { nullsFirst: true })
    setProfiles(data || [])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetch() }, [fetch])

  const upsert = async (fields, profileId) => {
    if (profileId) {
      const { error } = await supabase
        .from('voice_profiles')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', profileId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('voice_profiles')
        .insert({ workspace_id: workspaceId, ...fields })
      if (error) throw error
    }
    await fetch()
  }

  const remove = async (profileId) => {
    const { error } = await supabase
      .from('voice_profiles')
      .delete()
      .eq('id', profileId)
    if (error) throw error
    await fetch()
  }

  return { profiles, loading, upsert, remove, refetch: fetch }
}

// Backward-compatible wrapper for single-persona workspaces
export function useVoiceProfile(workspaceId) {
  const { profiles, loading, upsert: _upsert, refetch } = useVoiceProfiles(workspaceId)
  const profile = profiles[0] || null

  const upsert = async (fields) => {
    await _upsert(fields, profile?.id)
  }

  return { profile, loading, upsert, refetch }
}
