import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useContentStyles(workspaceId) {
  const [styles, setStyles] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!supabase || !workspaceId) {
      setStyles([])
      setLoading(false)
      return
    }
    setLoading(true)

    const { data } = await supabase
      .from('content_styles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })

    setStyles(data || [])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetch() }, [fetch])

  // Group styles by category
  const grouped = styles.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  // Flat list of subcategory keys for rotation
  const subcategoryKeys = styles.map(s => s.subcategory_key)

  // Build label map: key -> subcategory name
  const labelMap = styles.reduce((acc, s) => {
    acc[s.subcategory_key] = s.subcategory
    return acc
  }, {})

  // Build colour map: key -> colour
  const colourMap = styles.reduce((acc, s) => {
    acc[s.subcategory_key] = s.colour
    return acc
  }, {})

  // Build guidance map: key -> guidance
  const guidanceMap = styles.reduce((acc, s) => {
    acc[s.subcategory_key] = s.guidance
    return acc
  }, {})

  return {
    styles,
    grouped,
    subcategoryKeys,
    labelMap,
    colourMap,
    guidanceMap,
    loading,
    refetch: fetch,
  }
}
