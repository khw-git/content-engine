import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useContentPillars(workspaceId) {
  const [pillars, setPillars] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!supabase || !workspaceId) return
    setLoading(true)
    const { data } = await supabase
      .from('content_pillars')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at')
    setPillars(data || [])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetch() }, [fetch])

  const create = async (fields) => {
    const { error } = await supabase
      .from('content_pillars')
      .insert({ workspace_id: workspaceId, ...fields })
    if (error) throw error
    await fetch()
  }

  const update = async (id, fields) => {
    const { error } = await supabase
      .from('content_pillars')
      .update(fields)
      .eq('id', id)
    if (error) throw error
    await fetch()
  }

  const remove = async (id) => {
    const { error } = await supabase
      .from('content_pillars')
      .delete()
      .eq('id', id)
    if (error) throw error
    await fetch()
  }

  return { pillars, loading, create, update, remove, refetch: fetch }
}
