import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useIcpConfig(workspaceId) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!supabase || !workspaceId) return
    setLoading(true)
    const { data } = await supabase
      .from('icp_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()
    setConfig(data)
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetch() }, [fetch])

  const upsert = async (fields) => {
    if (config) {
      const { error } = await supabase
        .from('icp_configs')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', config.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('icp_configs')
        .insert({ workspace_id: workspaceId, ...fields })
      if (error) throw error
    }
    await fetch()
  }

  return { config, loading, upsert, refetch: fetch }
}
