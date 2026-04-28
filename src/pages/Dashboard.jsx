import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { supabase } from '../lib/supabase'
import { getPostTypeLabel } from '../lib/postTypeUtils'

export default function Dashboard() {
  const { workspaces, loading, error, create, softDelete } = useWorkspaces()
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('personal')
  const [stats, setStats] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [formatAlerts, setFormatAlerts] = useState({})
  const [driftAlerts, setDriftAlerts] = useState([])
  const [driftLoading, setDriftLoading] = useState(false)

  useEffect(() => {
    if (!supabase || workspaces.length === 0) return
    fetchStats()
    checkFormatRepetition()
  }, [workspaces])

  const checkFormatRepetition = async () => {
    const alerts = {}
    for (const ws of workspaces) {
      const { data: recent } = await supabase
        .from('generated_content')
        .select('post_type')
        .eq('workspace_id', ws.id)
        .in('status', ['pushed', 'used', 'approved'])
        .order('generated_at', { ascending: false })
        .limit(10)

      if (!recent || recent.length < 5) continue

      let streak = 1
      let streakType = recent[0]?.post_type
      let maxStreak = 1
      let maxType = streakType

      for (let i = 1; i < recent.length; i++) {
        if (recent[i].post_type === recent[i - 1].post_type) {
          streak++
          if (streak > maxStreak) {
            maxStreak = streak
            maxType = recent[i].post_type
          }
        } else {
          streak = 1
        }
      }

      const counts = {}
      recent.forEach(r => { counts[r.post_type] = (counts[r.post_type] || 0) + 1 })
      const dominant = Object.entries(counts).find(([_, c]) => c >= 5)

      if (maxStreak >= 5) {
        alerts[ws.id] = `${maxStreak} ${getPostTypeLabel(maxType)} posts in a row - try mixing in a different format`
      } else if (dominant) {
        alerts[ws.id] = `${dominant[1]} of your last 10 posts are ${getPostTypeLabel(dominant[0])} - consider varying the rotation`
      }
    }
    setFormatAlerts(alerts)
  }

  const checkDrift = async () => {
    setDriftLoading(true)
    try {
      const { data } = await supabase.functions.invoke('check-voice-drift', { body: {} })
      if (data?.results) setDriftAlerts(data.results)
    } catch {}
    setDriftLoading(false)
  }

  const fetchStats = async () => {
    const statsMap = {}
    for (const ws of workspaces) {
      const [
        { data: content },
        { data: pending },
      ] = await Promise.all([
        supabase.from('generated_content').select('post_type, status, pushed_at')
          .eq('workspace_id', ws.id),
        supabase.from('generated_content').select('id')
          .eq('workspace_id', ws.id).in('status', ['draft', 'in_review']),
      ])

      const items = content || []
      const { data: wsStyles } = await supabase
        .from('content_styles')
        .select('subcategory_key')
        .eq('workspace_id', ws.id)
        .order('sort_order')
      const wsPostTypes = wsStyles?.map(s => s.subcategory_key) || ['pain', 'proof', 'bts', 'insight']
      const typeCounts = {}
      wsPostTypes.forEach(t => { typeCounts[t] = 0 })
      items.forEach(c => { typeCounts[c.post_type] = (typeCounts[c.post_type] || 0) + 1 })
      const minCount = Math.min(...wsPostTypes.map(t => typeCounts[t]))
      const nextType = wsPostTypes.find(t => typeCounts[t] === minCount) || wsPostTypes[0]

      const used = items.filter(c => c.status === 'used' || c.status === 'pushed')
      const lastUsed = used.length > 0
        ? used.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))[0].pushed_at
        : null

      statsMap[ws.id] = {
        total: items.length,
        pending: pending?.length || 0,
        used: used.length,
        nextType,
        lastUsed,
        typeCounts,
      }
    }
    setStats(statsMap)
  }

  if (!supabase) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Content Hub</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Supabase not connected</h2>
          <p className="text-sm text-amber-700 mb-4">
            Create a Supabase project, then add your credentials to <code className="bg-amber-100 px-1 rounded">.env</code>:
          </p>
          <pre className="text-left text-xs bg-amber-100 p-3 rounded">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
      </div>
    )
  }

  if (loading) return <div className="text-center py-16 text-gray-500">Loading...</div>
  if (error) return <div className="text-center py-16 text-red-600">Error: {error}</div>

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    await create(newName.trim(), newType)
    setNewName('')
    setNewType('personal')
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={checkDrift} disabled={driftLoading}
            className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {driftLoading ? 'Checking...' : 'Check Voice Drift'}
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
            {showForm ? 'Cancel' : 'Add Workspace'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200/80 shadow-sm rounded-lg p-6 mb-6">
          <div className="flex gap-4">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="personal">Personal</option>
              <option value="client">Client</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
              Create
            </button>
          </div>
        </form>
      )}

      {/* Voice drift alerts */}
      {driftAlerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {driftAlerts.filter(a => a.driftLevel !== 'none').map((alert, i) => (
            <div key={i} className={`px-4 py-3 rounded-lg border ${
              alert.driftLevel === 'minor' ? 'bg-yellow-50 border-yellow-200' :
              alert.driftLevel === 'moderate' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{alert.workspaceName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  alert.driftLevel === 'minor' ? 'bg-yellow-100 text-yellow-700' :
                  alert.driftLevel === 'moderate' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>{alert.driftLevel} drift</span>
              </div>
              <p className="text-sm text-gray-600">{alert.driftDirection}</p>
              {alert.recommendation && <p className="text-xs text-gray-500 mt-1">{alert.recommendation}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Workspace cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map(ws => {
          const s = stats[ws.id]
          return (
            <div key={ws.id} className="bg-white border border-gray-200/80 shadow-sm rounded-lg p-5 hover:border-indigo-300 hover:shadow-md transition-all relative group">
              <Link to={`/workspaces/${ws.id}`} className="block">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">{ws.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                    ws.type === 'personal'
                      ? 'bg-purple-50 text-purple-700 ring-purple-200/60'
                      : 'bg-blue-50 text-blue-700 ring-blue-200/60'
                  }`}>{ws.type}</span>
                </div>

                {s ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-900">{s.total}</div>
                        <div className="text-xs text-gray-500">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-900">{s.pending}</div>
                        <div className="text-xs text-gray-500">Pending</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-900">{s.used}</div>
                        <div className="text-xs text-gray-500">Used</div>
                      </div>
                    </div>

                    {/* Type balance mini bar */}
                    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-gray-100 mb-3">
                      {s.total > 0 && Object.keys(s.typeCounts).map((t, i) => {
                        const colours = ['bg-indigo-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-blue-400', 'bg-violet-400', 'bg-teal-400', 'bg-orange-400', 'bg-cyan-400', 'bg-pink-400', 'bg-gray-400']
                        return <div key={t} className={colours[i % colours.length]} style={{ width: `${(s.typeCounts[t] / s.total) * 100}%` }} />
                      })}
                    </div>

                    {formatAlerts[ws.id] && (
                      <div className="mb-3 px-3 py-2 rounded-md text-xs bg-amber-50/70 border border-amber-200/70">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <span className="font-medium text-amber-700">Format repetition</span>
                        </div>
                        <p className="text-amber-600">{formatAlerts[ws.id]}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Next: <span className="font-medium text-gray-700">{getPostTypeLabel(s.nextType)}</span></span>
                      {s.lastUsed && (
                        <span>Last used: {new Date(s.lastUsed).toLocaleDateString()}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-400">Loading stats...</div>
                )}
              </Link>

              {/* Delete button */}
              {confirmDelete === ws.id ? (
                <div className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center gap-3 z-10">
                  <p className="text-sm text-gray-700 font-medium">Remove {ws.name}?</p>
                  <p className="text-xs text-gray-500">You can restore it from Settings</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await softDelete(ws.id); setConfirmDelete(null) }}
                      className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmDelete(ws.id) }}
                  className="absolute bottom-3 right-3 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors z-10"
                  title="Remove workspace"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {workspaces.length === 0 && (
        <p className="text-center text-gray-500 py-8">No workspaces yet. Add one to get started.</p>
      )}
    </div>
  )
}
