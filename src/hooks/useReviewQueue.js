import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useReviewQueue(filters = {}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ draft: 0, in_review: 0, approved: 0, pushed: 0, rejected: 0, used: 0 })

  const fetch = useCallback(async () => {
    if (!supabase) return
    setLoading(true)

    let query = supabase
      .from('generated_content')
      .select(`
        *,
        workspaces:workspace_id (id, name, type),
        content_pillars:pillar_id (id, name),
        voice_profiles:voice_profile_id (id, persona_name)
      `)
      .order('generated_at', { ascending: false })

    if (filters.workspaceId) query = query.eq('workspace_id', filters.workspaceId)
    if (filters.statuses?.length) query = query.in('status', filters.statuses)
    else if (filters.status) query = query.eq('status', filters.status)
    if (filters.postType) query = query.eq('post_type', filters.postType)
    if (filters.pillarId) query = query.eq('pillar_id', filters.pillarId)

    const { data } = await query
    setItems(data || [])

    // Get counts for badges
    const { data: allItems } = await supabase
      .from('generated_content')
      .select('status')

    if (allItems) {
      const c = { draft: 0, in_review: 0, approved: 0, pushed: 0, rejected: 0, used: 0 }
      allItems.forEach(item => { if (c[item.status] !== undefined) c[item.status]++ })
      setCounts(c)
    }

    setLoading(false)
  }, [filters.workspaceId, filters.status, filters.postType, filters.pillarId, JSON.stringify(filters.statuses)])

  useEffect(() => { fetch() }, [fetch])

  const updateStatus = async (id, status) => {
    const { error } = await supabase
      .from('generated_content')
      .update({ status })
      .eq('id', id)
    if (error) throw error
    await fetch()
  }

  const updateContent = async (id, originalText, editedText) => {
    // Update the content
    const { error } = await supabase
      .from('generated_content')
      .update({ content: editedText })
      .eq('id', id)
    if (error) throw error

    // Calculate edit distance
    const editDistancePct = calculateEditDistance(originalText, editedText)
    const editType = editDistancePct > 15 ? 'heavy_rewrite' : 'minor_edit'

    // Store edit history
    await supabase.from('edit_history').insert({
      content_id: id,
      original_text: originalText,
      edited_text: editedText,
      edit_type: editType,
      edit_distance_pct: editDistancePct,
    })

    await fetch()
    return { editType, editDistancePct }
  }

  const reject = async (id, reason) => {
    const { error } = await supabase
      .from('generated_content')
      .update({ status: 'rejected' })
      .eq('id', id)
    if (error) throw error

    // Get original content for history
    const item = items.find(i => i.id === id)
    if (item) {
      await supabase.from('edit_history').insert({
        content_id: id,
        original_text: item.content,
        edit_type: 'rejected',
        rejection_reason: reason || null,
      })
    }

    await fetch()
  }

  const remove = async (id) => {
    const { error } = await supabase
      .from('generated_content')
      .delete()
      .eq('id', id)
    if (error) throw error
    await fetch()
  }

  return { items, loading, counts, updateStatus, updateContent, reject, remove, refetch: fetch }
}

function calculateEditDistance(original, edited) {
  if (!original || !edited) return 100
  const originalWords = original.split(/\s+/)
  const editedWords = edited.split(/\s+/)
  const maxLen = Math.max(originalWords.length, editedWords.length)
  if (maxLen === 0) return 0

  let changes = 0
  const longer = originalWords.length > editedWords.length ? originalWords : editedWords
  const shorter = originalWords.length > editedWords.length ? editedWords : originalWords

  for (let i = 0; i < longer.length; i++) {
    if (shorter[i] !== longer[i]) changes++
  }

  return Math.round((changes / maxLen) * 100)
}
