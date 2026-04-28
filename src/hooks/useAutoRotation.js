import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useAutoRotation(workspaceId, pillarId, subcategoryKeys = []) {
  const [nextType, setNextType] = useState('')
  const [distribution, setDistribution] = useState({})
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!supabase || !workspaceId || subcategoryKeys.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)

    // Get all generated content for this workspace (optionally filtered by pillar)
    let query = supabase
      .from('generated_content')
      .select('post_type')
      .eq('workspace_id', workspaceId)
      .in('status', ['draft', 'in_review', 'approved', 'pushed'])

    if (pillarId) {
      query = query.eq('pillar_id', pillarId)
    }

    const { data } = await query

    // Count distribution across all configured subcategory keys
    const counts = {}
    subcategoryKeys.forEach(key => { counts[key] = 0 })
    if (data) {
      data.forEach(item => {
        if (counts[item.post_type] !== undefined) {
          counts[item.post_type]++
        }
      })
    }
    setDistribution(counts)

    // Find the next type in rotation (the one with fewest posts)
    const minCount = Math.min(...subcategoryKeys.map(t => counts[t]))
    const next = subcategoryKeys.find(t => counts[t] === minCount) || subcategoryKeys[0] || ''
    setNextType(next)

    setLoading(false)
  }, [workspaceId, pillarId, subcategoryKeys.join(',')])

  useEffect(() => { fetch() }, [fetch])

  return { nextType, distribution, loading, postTypes: subcategoryKeys, refetch: fetch }
}
