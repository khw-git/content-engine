import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DesignBriefDisplay from '../components/DesignBriefDisplay'

import { getPostTypeLabel } from '../lib/postTypeUtils'

export default function MasterAdmin() {
  const [workspaces, setWorkspaces] = useState([])
  const [configs, setConfigs] = useState({})
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0, currentWorkspace: '' })
  const [samePillar, setSamePillar] = useState({})
  const [selectedPillar, setSelectedPillar] = useState({})
  const [enabled, setEnabled] = useState({})
  const [cancelled, setCancelled] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [includeDesignBrief, setIncludeDesignBrief] = useState(false)
  const [designType, setDesignType] = useState('')
  const [scheduledFor, setScheduledFor] = useState(() => {
    const now = new Date()
    const mon = new Date(now)
    mon.setDate(mon.getDate() - mon.getDay() + 1) // current Monday
    return mon.toISOString().split('T')[0]
  })
  const cancelRef = useRef(false)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    const { data: ws } = await supabase.from('workspaces').select('*').is('deleted_at', null).order('created_at')
    if (!ws) { setLoading(false); return }

    const configMap = {}
    for (const w of ws) {
      const [
        { data: voiceProfiles },
        { data: icp },
        { data: pillars },
        { data: content },
      ] = await Promise.all([
        supabase.from('voice_profiles').select('*').eq('workspace_id', w.id).order('persona_name', { nullsFirst: true }),
        supabase.from('icp_configs').select('*').eq('workspace_id', w.id).single(),
        supabase.from('content_pillars').select('*').eq('workspace_id', w.id).order('created_at'),
        supabase.from('generated_content').select('post_type, pillar_id')
          .eq('workspace_id', w.id)
          .in('status', ['draft', 'in_review', 'approved', 'pushed']),
      ])

      // Fetch workspace content styles for dynamic post types
      const { data: wsStyles } = await supabase
        .from('content_styles')
        .select('subcategory_key')
        .eq('workspace_id', w.id)
        .order('sort_order')
      const wsPostTypes = wsStyles?.map(s => s.subcategory_key) || ['pain', 'proof', 'bts', 'insight']

      // Calculate next posts in rotation per pillar
      const pillarRotation = (pillars || []).map(pillar => {
        const pillarContent = (content || []).filter(c => c.pillar_id === pillar.id)
        const typeCounts = {}
        wsPostTypes.forEach(t => { typeCounts[t] = 0 })
        pillarContent.forEach(c => { typeCounts[c.post_type] = (typeCounts[c.post_type] || 0) + 1 })
        const minCount = Math.min(...wsPostTypes.map(t => typeCounts[t]))
        const nextType = wsPostTypes.find(t => typeCounts[t] === minCount) || wsPostTypes[0]
        return { pillar, nextType, typeCounts }
      })

      configMap[w.id] = { voiceProfiles: voiceProfiles || [], icp, pillars: pillars || [], pillarRotation, postTypes: wsPostTypes }
    }

    setWorkspaces(ws)
    setConfigs(configMap)
    // Default 1 post per workspace, all enabled
    const defaultCounts = {}
    const defaultEnabled = {}
    ws.forEach(w => { defaultCounts[w.id] = 1; defaultEnabled[w.id] = true })
    setCounts(defaultCounts)
    setEnabled(defaultEnabled)
    setLoading(false)
  }

  const getGenerationPlan = () => {
    const plan = []
    for (const ws of workspaces) {
      if (!enabled[ws.id]) continue
      const count = counts[ws.id] || 0
      if (count === 0) continue
      const config = configs[ws.id]
      if (!config || config.pillars.length === 0) continue

      // Build a queue: cycle through all post types first, then pillars
      const wsPostTypes = config.postTypes || ['pain', 'proof', 'bts', 'insight']
      const globalTypeCounts = {}
      wsPostTypes.forEach(t => { globalTypeCounts[t] = 0 })
      // Seed with existing content counts across all pillars
      config.pillarRotation.forEach(r => {
        wsPostTypes.forEach(t => { globalTypeCounts[t] += (r.typeCounts[t] || 0) })
      })

      const personas = config.voiceProfiles.length > 0 ? config.voiceProfiles : [null]

      // Distribute posts evenly across personas: each persona gets count/personas posts
      // This ensures a full rotation gives every persona all 4 post types
      const postsPerPersona = Math.ceil(count / personas.length)

      for (const persona of personas) {
        // Track post type rotation independently per persona
        const personaTypeCounts = { ...globalTypeCounts }

        for (let i = 0; i < postsPerPersona; i++) {
          // Stop if we've hit the total count for this workspace
          const totalSoFar = plan.filter(p => p.workspace.id === ws.id).length
          if (totalSoFar >= count) break

          // Pick the post type with the fewest posts for this persona
          const minCount = Math.min(...wsPostTypes.map(t => personaTypeCounts[t]))
          const nextType = wsPostTypes.find(t => personaTypeCounts[t] === minCount) || wsPostTypes[0]
          personaTypeCounts[nextType]++

          // Pick pillar: same pillar for all if checked, otherwise round-robin
          const pillarIndex = plan.filter(p => p.workspace.id === ws.id).length
          let pillar
          if (samePillar[ws.id]) {
            const chosen = config.pillars.find(p => p.id === selectedPillar[ws.id])
            pillar = chosen || config.pillars[0]
          } else {
            pillar = config.pillars[pillarIndex % config.pillars.length]
          }

          plan.push({
            workspace: ws,
            pillar,
            postType: nextType,
            voiceProfile: persona,
            icpConfig: config.icp,
            pillars: config.pillars,
          })
        }
      }
    }
    return plan
  }

  const handleGenerate = async () => {
    const plan = getGenerationPlan()
    if (plan.length === 0) return

    setGenerating(true)
    setResults([])
    setProgress({ current: 0, total: plan.length, currentWorkspace: '' })
    cancelRef.current = false
    setCancelled(false)
    setStopping(false)

    const allResults = []

    for (let i = 0; i < plan.length; i++) {
      if (cancelRef.current) { setCancelled(true); break }
      const item = plan[i]
      setProgress({ current: i + 1, total: plan.length, currentWorkspace: item.workspace.name })

      try {
        // Fetch recent posts for duplicate prevention
        const { data: recentPosts } = await supabase
          .from('generated_content')
          .select('content, post_type')
          .eq('workspace_id', item.workspace.id)
          .eq('status', 'pushed')
          .order('pushed_at', { ascending: false })
          .limit(20)

        const { data, error } = await supabase.functions.invoke('generate-content', {
          body: {
            voiceProfile: item.voiceProfile,
            pillars: item.pillars,
            icpConfig: item.icpConfig,
            selectedPillar: item.pillar,
            postType: item.postType,
            topic: '',
            recentPosts: recentPosts || [],
            includeDesignBrief,
            designType,
            workspaceName: item.workspace.name,
            workspaceType: item.workspace.type,
            workspaceId: item.workspace.id,
            retryDifferentAngle: false,
          },
        })

        if (cancelRef.current) { setCancelled(true); break }
        if (error || data.error) throw new Error(data?.error || error.message)

        // Auto-save as draft
        await supabase.from('generated_content').insert({
          workspace_id: item.workspace.id,
          pillar_id: item.pillar.id,
          post_type: item.postType,
          content: data.content,
          design_brief: data.designMockup ? (data.designBrief || '') + '\n---MOCKUP---\n' + data.designMockup : data.designBrief,
          status: 'draft',
          voice_profile_id: item.voiceProfile?.id || null,
          scheduled_for: scheduledFor || null,
        })

        allResults.push({
          workspace: item.workspace.name,
          pillar: item.pillar.name,
          postType: item.postType,
          content: data.content,
          designBrief: data.designBrief,
          designMockup: data.designMockup,
          status: 'success',
        })
      } catch (err) {
        allResults.push({
          workspace: item.workspace.name,
          pillar: item.pillar.name,
          postType: item.postType,
          content: '',
          status: 'error',
          error: err.message,
        })
      }

      setResults([...allResults])
    }

    setGenerating(false)
  }

  const plan = getGenerationPlan()
  const totalPosts = plan.length

  if (loading) return <div className="text-gray-500 py-16 text-center">Loading workspaces...</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Master Admin</h1>
        <Link to="/settings" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Settings
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-8">Generate content for all workspaces in bulk. Post types and pillars are auto-selected based on rotation.</p>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => {
            const newCounts = {}
            workspaces.forEach(ws => {
              const config = configs[ws.id]
              const personaCount = (config?.voiceProfiles?.length || 1)
              newCounts[ws.id] = (enabled[ws.id] && config && config.pillars.length > 0) ? 4 * personaCount : 0
            })
            setCounts(newCounts)
          }}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
        >
          Full rotation - all workspaces
        </button>
        <button
          onClick={() => {
            const newCounts = {}
            workspaces.forEach(ws => { newCounts[ws.id] = 0 })
            setCounts(newCounts)
          }}
          className="px-3 py-1.5 text-sm font-medium bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Per-workspace count selectors */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200 mb-6">
        {workspaces.map(ws => {
          const config = configs[ws.id]
          const hasPillars = config && config.pillars.length > 0
          return (
            <div key={ws.id} className={`p-4 flex items-center justify-between ${!enabled[ws.id] ? 'opacity-40' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{ws.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    ws.type === 'personal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>{ws.type}</span>
                </div>
                {hasPillars ? (
                  <p className="text-xs text-gray-400 mt-1">
                    {config.voiceProfiles.length > 1 && (
                      <span className="text-gray-500 font-medium">{config.voiceProfiles.map(p => p.persona_name || 'Default').join(', ')} - </span>
                    )}
                    {config.pillars.length} pillars - next up: {config.pillarRotation.map(r =>
                      `${r.pillar.name} (${getPostTypeLabel(r.nextType)})`
                    ).join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-amber-500 mt-1">No pillars configured</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {hasPillars && (() => {
                  const personaCount = config.voiceProfiles.length || 1
                  const fullCount = (config.postTypes?.length || 4) * personaCount
                  return (
                    <button
                      onClick={() => setCounts({ ...counts, [ws.id]: fullCount })}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        counts[ws.id] === fullCount
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      Full rotation{personaCount > 1 ? ` (${fullCount})` : ''}
                    </button>
                  )
                })()}
                {hasPillars && config.pillars.length > 1 && (counts[ws.id] || 0) > 1 && (
                  <div className="flex items-center gap-1.5 mr-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={!!samePillar[ws.id]}
                        onChange={() => {
                          const next = !samePillar[ws.id]
                          setSamePillar({ ...samePillar, [ws.id]: next })
                          if (next && !selectedPillar[ws.id]) {
                            setSelectedPillar({ ...selectedPillar, [ws.id]: config.pillars[0].id })
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Pillar:
                    </label>
                    {samePillar[ws.id] && (
                      <select
                        value={selectedPillar[ws.id] || config.pillars[0]?.id || ''}
                        onChange={(e) => setSelectedPillar({ ...selectedPillar, [ws.id]: e.target.value })}
                        className="px-2 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {config.pillars.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <label className="text-sm text-gray-500">Posts:</label>
                <select
                  value={counts[ws.id] || 0}
                  onChange={(e) => setCounts({ ...counts, [ws.id]: parseInt(e.target.value) })}
                  disabled={!hasPillars || !enabled[ws.id]}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <input
                  type="checkbox"
                  checked={!!enabled[ws.id]}
                  onChange={() => setEnabled({ ...enabled, [ws.id]: !enabled[ws.id] })}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 ml-2"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Plan preview */}
      {totalPosts > 0 && !generating && results.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Generation plan ({totalPosts} posts)</h3>
          <div className="space-y-1">
            {plan.map((item, i) => (
              <div key={i} className="text-sm text-gray-600 flex gap-2">
                <span className="text-gray-400 w-6">{i + 1}.</span>
                <span className="font-medium">{item.workspace.name}</span>
                {item.voiceProfile?.persona_name && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{item.voiceProfile.persona_name}</span>
                )}
                <span className="text-gray-400">-</span>
                <span>{item.pillar.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{getPostTypeLabel(item.postType)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule for week */}
      {totalPosts > 0 && !generating && results.length === 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Schedule for</label>
          <select
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(() => {
              const options = []
              const now = new Date()
              for (let i = 0; i < 6; i++) {
                const mon = new Date(now)
                mon.setDate(mon.getDate() - mon.getDay() + 1 + i * 7)
                const dateStr = mon.toISOString().split('T')[0]
                const label = `w/c ${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                options.push(<option key={dateStr} value={dateStr}>{label}</option>)
              }
              return options
            })()}
          </select>
        </div>
      )}

      {/* Design brief toggle */}
      {totalPosts > 0 && !generating && results.length === 0 && (
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={includeDesignBrief}
              onChange={(e) => { setIncludeDesignBrief(e.target.checked); if (!e.target.checked) setDesignType('') }}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Include design briefs</span>
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
      )}

      {/* Generate button */}
      {generating ? (
        <button
          onClick={() => { cancelRef.current = true; setStopping(true) }}
          disabled={stopping}
          className={`w-full px-4 py-3 font-medium rounded-md transition-colors mb-6 ${
            stopping ? 'bg-amber-500 text-white animate-pulse' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {stopping
            ? `Stopping after current post... (${progress.current}/${progress.total})`
            : `Stop Generation (${progress.current}/${progress.total} - ${progress.currentWorkspace})`
          }
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={totalPosts === 0}
          className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-6"
        >
          {`Generate ${totalPosts} Post${totalPosts !== 1 ? 's' : ''}`
        }
      </button>
      )}

      {cancelled && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
          Generation stopped. {results.filter(r => r.status === 'success').length} post{results.filter(r => r.status === 'success').length !== 1 ? 's' : ''} generated before stopping.
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Results ({results.filter(r => r.status === 'success').length}/{results.length} successful)
          </h2>
          {results.map((r, i) => (
            <div key={i} className={`bg-white border rounded-lg overflow-hidden ${
              r.status === 'error' ? 'border-red-200' : 'border-gray-200'
            }`}>
              <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                <span className="font-medium text-sm text-gray-900">{r.workspace}</span>
                <span className="text-sm text-gray-500">{r.pillar}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{getPostTypeLabel(r.postType)}</span>
                {r.status === 'success' && <span className="text-xs text-green-600 ml-auto">Saved as draft</span>}
                {r.status === 'error' && <span className="text-xs text-red-600 ml-auto">Failed</span>}
              </div>
              {r.status === 'success' ? (
                <div className="p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">{r.content}</pre>
                  {r.designBrief && (
                    <DesignBriefDisplay designBrief={r.designMockup ? r.designBrief + '\n---MOCKUP---\n' + r.designMockup : r.designBrief} />
                  )}
                </div>
              ) : (
                <div className="p-4 text-sm text-red-600">{r.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
