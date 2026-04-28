import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useWorkspaces({ includeDeleted = false } = {}) {
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!supabase) {
      setWorkspaces([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase.from('workspaces').select('*').order('created_at')
    if (!includeDeleted) {
      query = query.is('deleted_at', null)
    }
    const { data, error: err } = await query
    if (err) setError(err.message)
    else setWorkspaces(data)
    setLoading(false)
  }, [includeDeleted])

  useEffect(() => { fetch() }, [fetch])

  const create = async (name, type) => {
    const { data, error: err } = await supabase
      .from('workspaces')
      .insert({ name, type })
      .select()
      .single()
    if (err) throw err
    await fetch()
    return data
  }

  const update = async (id, fields) => {
    const { error: err } = await supabase
      .from('workspaces')
      .update(fields)
      .eq('id', id)
    if (err) throw err
    await fetch()
  }

  const softDelete = async (id) => {
    const { error: err } = await supabase
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
    await fetch()
  }

  const restore = async (id) => {
    const { error: err } = await supabase
      .from('workspaces')
      .update({ deleted_at: null })
      .eq('id', id)
    if (err) throw err
    await fetch()
  }

  const permanentDelete = async (id) => {
    const { error: err } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', id)
    if (err) throw err
    await fetch()
  }

  return { workspaces, loading, error, create, update, softDelete, restore, permanentDelete, refetch: fetch }
}
