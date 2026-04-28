import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { useVoiceProfiles } from '../hooks/useVoiceProfile'
import { useIcpConfig } from '../hooks/useIcpConfig'
import { useContentPillars } from '../hooks/useContentPillars'
import { useAutoRotation } from '../hooks/useAutoRotation'
import { useGenerateContent } from '../hooks/useGenerateContent'
import { useContentStyles } from '../hooks/useContentStyles'
import DesignBriefDisplay from '../components/DesignBriefDisplay'
import RefinePanel from '../components/RefinePanel'

export default function Generate() {
  const navigate = useNavigate()
  const { workspaces, loading: wsLoading } = useWorkspaces()

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [selectedPillarId, setSelectedPillarId] = useState('')
  const [selectedPostType, setSelectedPostType] = useState('')
  const [topic, setTopic] = useState('')
  const [includeDesignBrief, setIncludeDesignBrief] = useState(false)
  const [detailedPost, setDetailedPost] = useState(false)
  const [designType, setDesignType] = useState('')
  const [saved, setSaved] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [bothMode, setBothMode] = useState(false)
  const [bothResults, setBothResults] = useState([]) // [{profile, result, saved}]
  const [generatingBoth, setGeneratingBoth] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [weekOptions, setWeekOptions] = useState([])

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId)

  const { profiles: voiceProfiles } = useVoiceProfiles(selectedWorkspaceId)
  const hasMultiplePersonas = voiceProfiles.length > 1
  const voiceProfile = bothMode
    ? null
    : hasMultiplePersonas
      ? voiceProfiles.find(p => p.id === selectedProfileId) || null
      : voiceProfiles[0] || null
  const { config: icpConfig } = useIcpConfig(selectedWorkspaceId)
  const { pillars } = useContentPillars(selectedWorkspaceId)
  const { styles: contentStyles, grouped: styleGroups, subcategoryKeys, labelMap, colourMap, loading: stylesLoading } = useContentStyles(selectedWorkspaceId)
  const { nextType, distribution } = useAutoRotation(selectedWorkspaceId, selectedPillarId, subcategoryKeys)
  const { generate, saveAsDraft, generating, result, error, setResult } = useGenerateContent()
  const [selectedCategory, setSelectedCategory] = useState('')

  // Auto-select pillar with least content
  useEffect(() => {
    if (pillars.length > 0 && !selectedPillarId) {
      setSelectedPillarId(pillars[0].id)
    }
  }, [pillars, selectedPillarId])

  // Auto-select next post type from rotation
  useEffect(() => {
    if (nextType && !selectedPostType) {
      setSelectedPostType(nextType)
    }
  }, [nextType, selectedPostType])

  // Auto-select profile for single-persona workspaces
  useEffect(() => {
    if (voiceProfiles.length === 1) {
      setSelectedProfileId(voiceProfiles[0].id)
    } else if (voiceProfiles.length > 1 && !voiceProfiles.find(p => p.id === selectedProfileId)) {
      setSelectedProfileId('')
    }
  }, [voiceProfiles])

  // Reset selections when workspace changes
  useEffect(() => {
    setSelectedPillarId('')
    setSelectedPostType('')
    setSelectedCategory('')
    setSelectedProfileId('')
    setBothMode(false)
    setBothResults([])
    setResult(null)
    setSaved(false)
    setScheduledFor('')
    if (selectedWorkspaceId) detectNextAvailableWeek()
  }, [selectedWorkspaceId])

  // Build week options (next 6 weeks) and find the first one without content
  const detectNextAvailableWeek = async () => {
    const now = new Date()
    const options = []
    for (let i = 0; i < 6; i++) {
      const mon = new Date(now)
      mon.setDate(mon.getDate() - mon.getDay() + 1 + i * 7) // current week onwards
      mon.setHours(0, 0, 0, 0)
      const dateStr = mon.toISOString().split('T')[0]
      const label = `w/c ${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      options.push({ value: dateStr, label })
    }
    setWeekOptions(options)

    // Find first week without pushed/approved content for this workspace
    const { data } = await supabase
      .from('generated_content')
      .select('scheduled_for, status')
      .eq('workspace_id', selectedWorkspaceId)
      .in('status', ['approved', 'pushed', 'used'])
      .not('scheduled_for', 'is', null)

    const coveredWeeks = new Set((data || []).map(c => c.scheduled_for))
    const firstOpen = options.find(o => !coveredWeeks.has(o.value))
    setScheduledFor(firstOpen?.value || options[0]?.value || '')
  }

  const selectedPillar = pillars.find(p => p.id === selectedPillarId)
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Clear suggestions when pillar or post type changes
  useEffect(() => {
    setSuggestions([])
  }, [selectedPillarId, selectedPostType])

  const fetchSuggestions = async () => {
    if ((!selectedPillar && !isFreeTopicMode) || !selectedPostType || !icpConfig) return

    // Check sessionStorage cache
    const cacheKey = `suggestions_${selectedWorkspaceId}_${selectedPillarId}_${selectedPostType}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      setSuggestions(JSON.parse(cached))
      return
    }

    setLoadingSuggestions(true)
    try {
      // Fetch recent posts for this pillar
      const { data: recentPosts } = await supabase
        .from('generated_content')
        .select('content')
        .eq('workspace_id', selectedWorkspaceId)
        .eq('pillar_id', selectedPillarId)
        .eq('status', 'pushed')
        .order('pushed_at', { ascending: false })
        .limit(10)

      // Find the style guidance for the selected post type
      const selectedStyle = contentStyles.find(s => s.subcategory_key === selectedPostType)

      const { data, error } = await supabase.functions.invoke('suggest-topics', {
        body: {
          workspaceId: selectedWorkspaceId,
          pillar: isFreeTopicMode ? { name: 'Free topic', keywords: [] } : { name: selectedPillar.name, keywords: selectedPillar.keywords || [] },
          postType: selectedPostType,
          postTypeLabel: selectedStyle?.subcategory || selectedPostType,
          postTypeGuidance: selectedStyle?.guidance || '',
          icpConfig: { job_titles: icpConfig.job_titles || [], pain_points: icpConfig.pain_points || [] },
          recentPosts: recentPosts || [],
        },
      })

      if (!error && data?.suggestions) {
        setSuggestions(data.suggestions)
        sessionStorage.setItem(cacheKey, JSON.stringify(data.suggestions))
      }
    } catch {}
    setLoadingSuggestions(false)
  }

  const isFreeTopicMode = selectedPillarId === '_free'

  const handleGenerate = async (retryDifferentAngle = false, previousDesignBrief = null) => {
    if (!selectedWorkspace || (!selectedPillar && !isFreeTopicMode) || !selectedPostType) return
    setSaved(false)
    setShowRefine(false)
    setBothResults([])
    await generate({
      workspaceId: selectedWorkspaceId,
      voiceProfile,
      pillars,
      icpConfig,
      selectedPillar: isFreeTopicMode ? { name: 'Free topic', keywords: [] } : selectedPillar,
      postType: selectedPostType,
      topic,
      includeDesignBrief,
      designType,
      detailedPost,
      workspaceName: selectedWorkspace.name,
      workspaceType: selectedWorkspace.type,
      retryDifferentAngle,
      previousDesignBrief,
    })
  }

  const handleGenerateBoth = async () => {
    if (!selectedWorkspace || (!selectedPillar && !isFreeTopicMode) || !selectedPostType) return
    setGeneratingBoth(true)
    setResult(null)
    setSaved(false)
    setBothResults([])

    const results = []
    for (const profile of voiceProfiles) {
      try {
        const { data: recentPosts } = await supabase
          .from('generated_content')
          .select('content, post_type')
          .eq('workspace_id', selectedWorkspaceId)
          .eq('status', 'pushed')
          .order('pushed_at', { ascending: false })
          .limit(20)

        const { data, error: fnErr } = await supabase.functions.invoke('generate-content', {
          body: {
            voiceProfile: profile,
            pillars,
            icpConfig,
            selectedPillar: isFreeTopicMode ? { name: 'Free topic', keywords: [] } : selectedPillar,
            postType: selectedPostType,
            topic,
            recentPosts: recentPosts || [],
            includeDesignBrief,
            designType,
            detailedPost,
            workspaceName: selectedWorkspace.name,
            workspaceType: selectedWorkspace.type,
            workspaceId: selectedWorkspaceId,
            retryDifferentAngle: false,
          },
        })

        if (fnErr || data?.error) {
          results.push({ profile, result: null, error: data?.error || fnErr.message, saved: false })
        } else {
          results.push({ profile, result: data, error: null, saved: false })
        }
      } catch (err) {
        results.push({ profile, result: null, error: err.message, saved: false })
      }
      setBothResults([...results])
    }
    setGeneratingBoth(false)
  }

  const handleSaveBoth = async (index) => {
    const item = bothResults[index]
    if (!item?.result) return
    await saveAsDraft({
      workspaceId: selectedWorkspaceId,
      pillarId: isFreeTopicMode ? null : selectedPillarId,
      postType: selectedPostType,
      postCategory: selectedCategory || null,
      content: item.result.content,
      designBrief: item.result.designBrief,
      scheduledFor: scheduledFor || null,
      designMockup: item.result.designMockup,
      voiceProfileId: item.profile.id,
    })
    const updated = [...bothResults]
    updated[index] = { ...updated[index], saved: true }
    setBothResults(updated)
  }

  const handleSaveAllBoth = async () => {
    for (let i = 0; i < bothResults.length; i++) {
      if (bothResults[i].result && !bothResults[i].saved) {
        await handleSaveBoth(i)
      }
    }
  }

  const handleSave = async () => {
    if (!result) return
    await saveAsDraft({
      workspaceId: selectedWorkspaceId,
      pillarId: isFreeTopicMode ? null : selectedPillarId,
      postType: selectedPostType,
      postCategory: selectedCategory || null,
      content: result.content,
      designBrief: result.designBrief,
      designMockup: result.designMockup,
      voiceProfileId: voiceProfile?.id,
      scheduledFor: scheduledFor || null,
    })
    setSaved(true)
  }

  if (wsLoading) return <div className="text-gray-500 py-16 text-center">Loading...</div>

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Generate Content</h1>

      {/* Workspace selector */}
      <div className="space-y-6 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Workspace</label>
          <select
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a workspace...</option>
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.name} ({ws.type})</option>
            ))}
          </select>
        </div>

        {/* Persona selector - only shown for multi-persona workspaces */}
        {selectedWorkspaceId && hasMultiplePersonas && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Persona</label>
            <div className="flex gap-2">
              {voiceProfiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProfileId(p.id); setBothMode(false); setBothResults([]) }}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    selectedProfileId === p.id && !bothMode
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                  }`}
                >
                  {p.persona_name || 'Default'}
                </button>
              ))}
              <button
                onClick={() => { setBothMode(true); setSelectedProfileId(''); setResult(null) }}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  bothMode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                }`}
              >
                Both
              </button>
            </div>
          </div>
        )}

        {selectedWorkspaceId && weekOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Schedule for</label>
            <select
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {weekOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {selectedWorkspaceId && pillars.length > 0 && (!hasMultiplePersonas || selectedProfileId || bothMode) && (
          <>
            {/* Pillar selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content Pillar</label>
              <select
                value={selectedPillarId}
                onChange={(e) => {
                  setSelectedPillarId(e.target.value)
                  setSelectedPostType('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="_free">Free topic (no pillar)</option>
                {pillars.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Content style selector with category → subcategory */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Style
                {nextType && <span className="text-gray-400 font-normal ml-2">(auto-rotation suggests: {labelMap[nextType] || nextType})</span>}
              </label>
              {stylesLoading ? (
                <span className="text-sm text-gray-400">Loading styles...</span>
              ) : Object.keys(styleGroups).length === 0 ? (
                <p className="text-sm text-amber-600">No content styles configured for this workspace.</p>
              ) : Object.keys(styleGroups).length === 1 ? (
                /* Single category (e.g. client workspaces with just "Format") — show flat grid */
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(styleGroups)[0].map(style => (
                    <button
                      key={style.subcategory_key}
                      onClick={() => { setSelectedCategory(style.category); setSelectedPostType(style.subcategory_key) }}
                      className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                        selectedPostType === style.subcategory_key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      {style.subcategory}
                      <span className="block text-xs mt-0.5 opacity-70">{distribution[style.subcategory_key] || 0} posts</span>
                    </button>
                  ))}
                </div>
              ) : (
                /* Multiple categories — show category tabs then subcategory buttons */
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(styleGroups).map(cat => (
                      <button
                        key={cat}
                        onClick={() => { setSelectedCategory(cat); setSelectedPostType('') }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          selectedCategory === cat
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {selectedCategory && styleGroups[selectedCategory] && (
                    <div className="grid grid-cols-3 gap-2">
                      {styleGroups[selectedCategory].map(style => (
                        <button
                          key={style.subcategory_key}
                          onClick={() => setSelectedPostType(style.subcategory_key)}
                          className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors text-left ${
                            selectedPostType === style.subcategory_key
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                          }`}
                        >
                          {style.subcategory}
                          <span className="block text-xs mt-0.5 opacity-70">{distribution[style.subcategory_key] || 0} posts</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Topic input with suggestions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topic / Angle <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="e.g. Why most founders hire a Head of Sales too early"
              />
              {selectedPillar && selectedPostType && icpConfig && (
                <div className="mt-3">
                  {suggestions.length === 0 && !loadingSuggestions && (
                    <button
                      onClick={fetchSuggestions}
                      className="px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
                    >
                      Suggest Topics
                    </button>
                  )}
                  {loadingSuggestions && (
                    <span className="text-sm text-gray-400">Generating suggestions...</span>
                  )}
                  {suggestions.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500 uppercase">Suggested angles</span>
                        <button
                          onClick={() => { sessionStorage.removeItem(`suggestions_${selectedWorkspaceId}_${selectedPillarId}_${selectedPostType}`); setSuggestions([]); fetchSuggestions() }}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          Refresh
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => setTopic(s)}
                            className={`text-left text-sm px-3 py-1.5 rounded-md border transition-colors ${
                              topic === s
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detailed post */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={detailedPost}
                  onChange={(e) => setDetailedPost(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Detailed post</span>
                <span className="text-xs text-gray-400">(long-form, up to 3,000 characters)</span>
              </label>
            </div>

            {/* Design brief */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={includeDesignBrief}
                  onChange={(e) => { setIncludeDesignBrief(e.target.checked); if (!e.target.checked) setDesignType('') }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Include design brief</span>
              </label>
              {includeDesignBrief && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'carousel', label: 'Carousel', desc: 'Multi-slide swipeable post' },
                    { key: 'infographic', label: 'Infographic', desc: 'Data/stats visual summary' },
                    { key: 'workflow', label: 'Workflow Diagram', desc: 'Step-by-step process flow' },
                    { key: 'meme', label: 'Meme', desc: 'Humorous image/reaction' },
                    { key: 'comparison', label: 'Comparison', desc: 'Before/after or vs layout' },
                    { key: 'quote_card', label: 'Quote Card', desc: 'Key quote as visual' },
                    { key: 'checklist', label: 'Checklist', desc: 'Visual checklist/scorecard' },
                    { key: 'data_viz', label: 'Data Visualisation', desc: 'Chart, graph, or table' },
                    { key: 'screenshot', label: 'Screenshot/Mockup', desc: 'Tool or result screenshot' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setDesignType(opt.key)}
                      className={`p-2.5 rounded-md text-left border transition-colors ${
                        designType === opt.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      <span className="text-sm font-medium block">{opt.label}</span>
                      <span className={`text-xs block mt-0.5 ${designType === opt.key ? 'text-indigo-200' : 'text-gray-400'}`}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Generate button */}
            {bothMode ? (
              <button
                onClick={handleGenerateBoth}
                disabled={generatingBoth || !selectedPostType}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generatingBoth
                  ? `Generating ${bothResults.length + 1}/${voiceProfiles.length}...`
                  : `Generate for All ${voiceProfiles.length} Personas`}
              </button>
            ) : (
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating || !selectedPostType}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? 'Generating...' : 'Generate Post'}
              </button>
            )}
          </>
        )}

        {selectedWorkspaceId && pillars.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-700">
              No content pillars configured for this workspace.{' '}
              <button onClick={() => navigate(`/workspaces/${selectedWorkspaceId}`)} className="underline">
                Add pillars first
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Both-mode results */}
      {bothResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Generated for {bothResults.length} persona{bothResults.length !== 1 ? 's' : ''}
            </h2>
            {bothResults.filter(r => r.result && !r.saved).length > 0 && (
              <button
                onClick={handleSaveAllBoth}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
              >
                Save All as Drafts
              </button>
            )}
          </div>
          {bothResults.map((item, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{item.profile.persona_name || 'Default'}</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {labelMap[selectedPostType] || selectedPostType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {item.result && (
                    <button
                      onClick={() => navigator.clipboard.writeText(item.result.content)}
                      className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  )}
                  {item.result && (item.saved ? (
                    <span className="text-xs text-green-600 font-medium">Saved</span>
                  ) : (
                    <button
                      onClick={() => handleSaveBoth(i)}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      Save as Draft
                    </button>
                  ))}
                </div>
              </div>
              {item.error ? (
                <div className="p-4 text-sm text-red-600">{item.error}</div>
              ) : item.result ? (
                <div className="p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
                    {item.result.content}
                  </pre>
                </div>
              ) : (
                <div className="p-4 text-sm text-gray-400">Generating...</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Single result display */}
      {result && !bothMode && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">Generated Post</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {labelMap[selectedPostType] || selectedPostType}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Regenerate
              </button>
              <button
                onClick={() => handleGenerate(true)}
                disabled={generating}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Different Angle
              </button>
              <button
                onClick={() => setShowRefine(!showRefine)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  showRefine
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'text-indigo-600 border border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                Refine
              </button>
            </div>
          </div>

          <div className="p-6">
            <textarea
              value={result.content}
              onChange={(e) => {
                setResult(prev => ({ ...prev, content: e.target.value }))
                setSaved(false)
              }}
              className="w-full min-h-[200px] text-sm text-gray-800 leading-relaxed font-sans border-0 focus:outline-none focus:ring-0 resize-none bg-transparent"
              style={{ fieldSizing: 'content' }}
            />
          </div>

          {showRefine && (
            <div className="border-t border-gray-200" style={{ height: '400px' }}>
              <RefinePanel
                contentId={null}
                workspaceId={selectedWorkspaceId}
                currentContent={result.content}
                postType={selectedPostType}
                pillarName={selectedPillar?.name || ''}
                voiceProfileId={voiceProfile?.id || selectedProfileId || null}
                onApply={(refinedContent) => {
                  setResult(prev => ({ ...prev, content: refinedContent }))
                  setSaved(false)
                }}
              />
            </div>
          )}

          {result.designBrief && (
            <div className="px-6 pb-2">
              <div className="flex justify-end mb-1">
                <button
                  onClick={async () => {
                    setResult(prev => ({ ...prev, designBrief: null, designMockup: null }))
                    const { data } = await supabase.functions.invoke('generate-content', {
                      body: {
                        voiceProfile: null,
                        pillars: [],
                        icpConfig: null,
                        selectedPillar: { name: selectedPillar?.name || 'General', keywords: [] },
                        postType: selectedPostType,
                        recentPosts: [],
                        includeDesignBrief: true,
                        designType,
                        workspaceName: selectedWorkspace?.name || '',
                        workspaceType: selectedWorkspace?.type || 'client',
                        workspaceId: selectedWorkspaceId,
                        existingContent: result.content,
                        previousDesignBrief: result.designBrief,
                      },
                    })
                    if (data?.designBrief) {
                      setResult(prev => ({ ...prev, designBrief: data.designBrief, designMockup: data.designMockup }))
                    }
                  }}
                  disabled={generating || !result.designBrief}
                  className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  {!result.designBrief ? 'Generating...' : 'Try another brief'}
                </button>
              </div>
              <DesignBriefDisplay designBrief={result.designMockup ? result.designBrief + '\n---MOCKUP---\n' + result.designMockup : result.designBrief} />
            </div>
          )}

          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.content)
              }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Copy to Clipboard
            </button>
            {saved ? (
              <span className="text-sm text-green-600 font-medium">Saved as draft</span>
            ) : (
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
              >
                Save as Draft
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
