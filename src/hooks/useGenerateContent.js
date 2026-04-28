import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function useGenerateContent() {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const generate = async ({
    workspaceId,
    voiceProfile,
    pillars,
    icpConfig,
    selectedPillar,
    postType,
    topic,
    includeDesignBrief,
    designType,
    detailedPost,
    workspaceName,
    workspaceType,
    retryDifferentAngle,
    previousDesignBrief,
  }) => {
    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      // Fetch last 20 pushed posts for duplicate detection
      const { data: recentPosts } = await supabase
        .from('generated_content')
        .select('content, post_type')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pushed')
        .order('pushed_at', { ascending: false })
        .limit(20)

      const { data, error: fnError } = await supabase.functions.invoke('generate-content', {
        body: {
          voiceProfile,
          pillars,
          icpConfig,
          selectedPillar,
          postType,
          topic,
          recentPosts: recentPosts || [],
          includeDesignBrief,
          designType,
          detailedPost,
          workspaceName,
          workspaceType,
          workspaceId,
          retryDifferentAngle,
          previousDesignBrief: previousDesignBrief || null,
        },
      })

      if (fnError) throw fnError
      if (data.error) throw new Error(data.error)

      setResult(data)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setGenerating(false)
    }
  }

  const saveAsDraft = async ({ workspaceId, pillarId, postType, postCategory, content, designBrief, designMockup, voiceProfileId, scheduledFor }) => {
    let briefToSave = designBrief || null
    if (briefToSave && designMockup) {
      briefToSave += '\n---MOCKUP---\n' + designMockup
    }
    const { data, error: err } = await supabase
      .from('generated_content')
      .insert({
        workspace_id: workspaceId,
        pillar_id: pillarId,
        post_type: postType,
        post_category: postCategory || null,
        content,
        design_brief: briefToSave,
        status: 'draft',
        voice_profile_id: voiceProfileId || null,
        scheduled_for: scheduledFor || null,
      })
      .select()
      .single()

    if (err) throw err
    return data
  }

  return { generate, saveAsDraft, generating, result, error, setResult }
}
