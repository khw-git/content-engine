import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPostTypeLabel } from '../lib/postTypeUtils'
import { useVoiceProfiles } from '../hooks/useVoiceProfile'
import { useIcpConfig } from '../hooks/useIcpConfig'
import { useContentPillars } from '../hooks/useContentPillars'
import TabNav from '../components/TabNav'
import TagInput from '../components/TagInput'

const TABS = [
  { key: 'voice', label: 'Voice Profile' },
  { key: 'pillars', label: 'Content Pillars' },
  { key: 'styles', label: 'Content Styles' },
  { key: 'icp', label: 'ICP Config' },
  { key: 'feedback', label: 'Feedback' },
]

export default function WorkspaceDetail() {
  const { id } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [activeTab, setActiveTab] = useState('voice')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [postsPerWeekSaving, setPostsPerWeekSaving] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.from('workspaces').select('*').eq('id', id).single()
      .then(({ data }) => {
        setWorkspace(data)
        setNameDraft(data?.name || '')
      })
  }, [id])

  const showMessage = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 2000)
  }

  const handlePostsPerWeek = async (value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    if (n === workspace.posts_per_week) return
    setPostsPerWeekSaving(true)
    const { error } = await supabase.from('workspaces').update({ posts_per_week: n }).eq('id', id)
    setPostsPerWeekSaving(false)
    if (error) { showMessage(`Save failed: ${error.message}`); return }
    setWorkspace({ ...workspace, posts_per_week: n })
    showMessage(`Target set to ${n} post${n === 1 ? '' : 's'}/week per persona`)
  }

  const handleRename = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === workspace.name) {
      setEditingName(false)
      setNameDraft(workspace.name)
      return
    }
    setRenameSaving(true)
    const { error } = await supabase.from('workspaces').update({ name: trimmed }).eq('id', id)
    setRenameSaving(false)
    if (error) {
      showMessage(`Rename failed: ${error.message}`)
      return
    }
    setWorkspace({ ...workspace, name: trimmed })
    setEditingName(false)
    showMessage('Workspace renamed')
  }

  if (!workspace) {
    return <div className="text-center py-16 text-gray-500">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="text-gray-400 hover:text-gray-600">&larr; Back</Link>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') { setEditingName(false); setNameDraft(workspace.name) }
              }}
              autoFocus
              className="text-2xl font-bold text-gray-900 px-2 py-1 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleRename}
              disabled={renameSaving}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {renameSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditingName(false); setNameDraft(workspace.name) }}
              className="px-3 py-1 text-sm text-gray-600 rounded-md hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
            <button
              onClick={() => setEditingName(true)}
              className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename workspace"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
          workspace.type === 'personal'
            ? 'bg-purple-50 text-purple-700 ring-purple-200/60'
            : 'bg-blue-50 text-blue-700 ring-blue-200/60'
        }`}>
          {workspace.type}
        </span>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ml-1">
          <span>Posts/week per persona</span>
          <input
            type="number"
            min={0}
            max={14}
            defaultValue={workspace.posts_per_week ?? 4}
            disabled={postsPerWeekSaving}
            onBlur={(e) => handlePostsPerWeek(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-14 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            title="Target posts per week per persona. Used for content pacing guidance."
          />
          {postsPerWeekSaving && <span className="text-xs text-gray-400">saving…</span>}
        </label>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-md">
          {message}
        </div>
      )}

      <FileUploadParser workspaceId={id} showMessage={showMessage} />

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'voice' && (
        <VoiceTab workspaceId={id} workspaceType={workspace.type} saving={saving} setSaving={setSaving} showMessage={showMessage} />
      )}
      {activeTab === 'pillars' && (
        <PillarsTab workspaceId={id} saving={saving} setSaving={setSaving} showMessage={showMessage} />
      )}
      {activeTab === 'styles' && (
        <ContentStylesTab workspaceId={id} saving={saving} setSaving={setSaving} showMessage={showMessage} />
      )}
      {activeTab === 'icp' && (
        <IcpTab workspaceId={id} saving={saving} setSaving={setSaving} showMessage={showMessage} />
      )}
      {activeTab === 'feedback' && (
        <FeedbackTab workspaceId={id} />
      )}
    </div>
  )
}

function VoiceTab({ workspaceId, workspaceType, saving, setSaving, showMessage }) {
  const { profiles, loading, upsert, remove } = useVoiceProfiles(workspaceId)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [personaName, setPersonaName] = useState('')
  const [toneDescriptors, setToneDescriptors] = useState([])
  const [examplePosts, setExamplePosts] = useState([''])
  const [guardrails, setGuardrails] = useState('')
  const [personalRules, setPersonalRules] = useState('')
  const [voiceReference, setVoiceReference] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [setupNames, setSetupNames] = useState([''])
  const [settingUp, setSettingUp] = useState(false)

  // Auto-open setup if no profiles exist
  useEffect(() => {
    if (!loading && profiles.length === 0) setShowSetup(true)
  }, [loading, profiles])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const resetForm = () => {
    setEditingId(null)
    setPersonaName('')
    setToneDescriptors([])
    setExamplePosts([''])
    setGuardrails('')
    setPersonalRules('')
    setVoiceReference('')
    setShowForm(false)
  }

  const startEdit = (profile) => {
    setEditingId(profile.id)
    setPersonaName(profile.persona_name || '')
    setToneDescriptors(profile.tone_descriptors || [])
    setExamplePosts(profile.example_posts?.length ? profile.example_posts : [''])
    setGuardrails(profile.guardrails || '')
    setPersonalRules(profile.personal_rules || '')
    setVoiceReference(profile.voice_reference || '')
    setShowForm(true)
  }

  const startAdd = () => {
    resetForm()
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    await upsert({
      persona_name: personaName.trim() || null,
      tone_descriptors: toneDescriptors,
      example_posts: examplePosts.filter(p => p.trim()),
      guardrails,
      personal_rules: workspaceType === 'personal' ? personalRules : null,
      voice_reference: voiceReference.trim() || null,
    }, editingId || undefined)
    setSaving(false)
    showMessage(editingId ? 'Voice profile updated' : 'Voice profile created')
    resetForm()
  }

  const handleDelete = async (profileId) => {
    if (!confirm('Delete this voice profile?')) return
    await remove(profileId)
    showMessage('Voice profile deleted')
  }

  const handleVoiceFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target.result
      const ext = file.name.split('.').pop().toLowerCase()
      let parsed = ''

      if (ext === 'json') {
        try {
          const obj = JSON.parse(raw)
          // Flatten JSON into readable text
          const flatten = (o, prefix = '') => {
            let result = ''
            for (const [k, v] of Object.entries(o)) {
              const label = prefix ? `${prefix} > ${k}` : k
              if (typeof v === 'string') {
                result += `${label}: ${v}\n`
              } else if (Array.isArray(v)) {
                result += `${label}: ${v.join(', ')}\n`
              } else if (typeof v === 'object' && v !== null) {
                result += flatten(v, label)
              }
            }
            return result
          }
          parsed = flatten(obj)
        } catch {
          parsed = raw
        }
      } else if (ext === 'csv') {
        // Parse CSV rows into structured text
        const rows = raw.split('\n').filter(r => r.trim())
        if (rows.length > 1) {
          const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
          const dataRows = rows.slice(1)
          parsed = dataRows.map(row => {
            const cells = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            return headers.map((h, i) => `${h}: ${cells[i] || ''}`).join('\n')
          }).join('\n---\n')
        } else {
          parsed = raw
        }
      } else {
        // .md or .txt — use as-is
        parsed = raw
      }

      setVoiceReference(parsed.trim())
      showMessage(`Voice reference loaded from ${file.name}`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleBulkCreatePersonas = async () => {
    const names = setupNames.filter(n => n.trim())
    if (names.length === 0) return
    setSettingUp(true)
    for (const name of names) {
      await upsert({ persona_name: name.trim() }, undefined)
    }
    setSettingUp(false)
    setShowSetup(false)
    setSetupNames([''])
    showMessage(`${names.length} persona${names.length !== 1 ? 's' : ''} created`)
  }

  const handlePasteApply = async (parsed) => {
    if (!parsed.voice_profile) return
    const vp = parsed.voice_profile
    const existing = profiles[0]
    if (!existing) return
    const updates = {}
    if (vp.tone_descriptors?.length) updates.tone_descriptors = [...new Set([...(existing.tone_descriptors || []), ...vp.tone_descriptors])]
    if (vp.guardrails) updates.guardrails = existing.guardrails ? existing.guardrails + '\n\n=== IMPORTED ===\n' + vp.guardrails : vp.guardrails
    if (vp.example_posts?.length) updates.example_posts = [...(existing.example_posts || []), ...vp.example_posts]
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString()
      await supabase.from('voice_profiles').update(updates).eq('id', existing.id)
      showMessage('Voice profile updated from paste')
      window.location.reload()
    }
  }

  return (
    <div className="max-w-2xl">
      <PasteAndParse workspaceId={workspaceId} section="voice" onApply={handlePasteApply} />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {profiles.length > 1 ? `Voice Profiles (${profiles.length} Personas)` : 'Voice Profile'}
        </h2>
        {!showForm && !showSetup && (
          <div className="flex gap-3">
            <button onClick={() => { setShowSetup(true); setSetupNames(['']) }} className="text-sm text-indigo-600 hover:text-indigo-800">
              + Add Personas
            </button>
          </div>
        )}
      </div>

      {/* Persona setup */}
      {showSetup && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-indigo-900">How many personas does this client need?</h3>
            <p className="text-xs text-indigo-600 mt-1">Each persona gets their own voice profile, content column, and LinkedIn output.</p>
          </div>

          <div className="space-y-2">
            {setupNames.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-indigo-600 w-6 text-right">{i + 1}.</span>
                <input
                  value={name}
                  onChange={(e) => {
                    const updated = [...setupNames]
                    updated[i] = e.target.value
                    setSetupNames(updated)
                  }}
                  className="flex-1 px-3 py-2 border border-indigo-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  placeholder={`Persona ${i + 1} name (e.g. Ben, Helen)`}
                  autoFocus={i === setupNames.length - 1}
                />
                {setupNames.length > 1 && (
                  <button
                    onClick={() => setSetupNames(setupNames.filter((_, j) => j !== i))}
                    className="text-indigo-500 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSetupNames([...setupNames, ''])}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + Add another
            </button>
            {setupNames.length > 1 && (
              <button
                onClick={() => setSetupNames(setupNames.slice(0, -1))}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Remove last
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleBulkCreatePersonas}
              disabled={settingUp || setupNames.every(n => !n.trim())}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {settingUp ? 'Creating...' : `Create ${setupNames.filter(n => n.trim()).length || 0} Persona${setupNames.filter(n => n.trim()).length !== 1 ? 's' : ''}`}
            </button>
            {profiles.length > 0 && (
              <button onClick={() => { setShowSetup(false); setSetupNames(['']) }}
                className="px-4 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-100">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Persona list */}
      {!showForm && profiles.length > 0 && (
        <div className="space-y-3 mb-6">
          {profiles.map(p => (
            <div key={p.id} className="bg-white border border-gray-200/80 shadow-sm rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900">{p.persona_name || 'Default'}</h3>
                  {p.tone_descriptors?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.tone_descriptors.map((t, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {p.example_posts?.length || 0} example posts
                    {p.guardrails ? ` - ${p.guardrails.length} char guardrails` : ''}
                    {p.voice_reference ? ' - voice reference loaded' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(p)} className="text-sm text-indigo-600 hover:text-indigo-800">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create form */}
      {showForm && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Persona Name <span className="text-gray-400 font-normal">(leave blank for single-persona workspaces)</span>
            </label>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Ben, Helen, Nathan"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tone Descriptors</label>
            <TagInput tags={toneDescriptors} onChange={setToneDescriptors} placeholder="e.g. direct, matey, British" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice Reference <span className="text-gray-400 font-normal">(upload a file describing tone, style, brand voice)</span>
            </label>
            {voiceReference ? (
              <div className="space-y-2">
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">{voiceReference.substring(0, 2000)}{voiceReference.length > 2000 ? '...' : ''}</pre>
                </div>
                <div className="flex gap-3">
                  <span className="text-xs text-gray-400">{voiceReference.length.toLocaleString()} characters loaded</span>
                  <button onClick={() => setVoiceReference('')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer">
                    Replace file
                    <input type="file" accept=".json,.csv,.md,.txt" className="hidden" onChange={handleVoiceFileUpload} />
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <label className="px-4 py-2 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 cursor-pointer transition-colors">
                  Upload .json, .csv, .md, or .txt
                  <input type="file" accept=".json,.csv,.md,.txt" className="hidden" onChange={handleVoiceFileUpload} />
                </label>
                <span className="text-xs text-gray-400">Describes tone, style, brand guidelines — used when no example posts exist</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Example Posts</label>
            {examplePosts.map((post, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <textarea
                  value={post}
                  onChange={(e) => {
                    const updated = [...examplePosts]
                    updated[i] = e.target.value
                    setExamplePosts(updated)
                  }}
                  rows={4}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Paste an example post..."
                />
                {examplePosts.length > 1 && (
                  <button
                    onClick={() => setExamplePosts(examplePosts.filter((_, j) => j !== i))}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-4">
              <button
                onClick={() => setExamplePosts([...examplePosts, ''])}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                + Add example post
              </button>
              <label className="text-sm text-indigo-600 hover:text-indigo-800 cursor-pointer">
                + Import from CSV
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      const text = ev.target.result
                      const rows = text.split('\n')
                      const posts = []
                      for (const row of rows) {
                        const trimmed = row.trim()
                        if (!trimmed) continue
                        const cleaned = trimmed.startsWith('"') && trimmed.endsWith('"')
                          ? trimmed.slice(1, -1).replace(/""/g, '"')
                          : trimmed
                        if (cleaned) posts.push(cleaned)
                      }
                      if (posts.length > 0) {
                        setExamplePosts([...examplePosts.filter(p => p.trim()), ...posts])
                        showMessage(`Imported ${posts.length} example posts`)
                      }
                    }
                    reader.readAsText(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Guardrails</label>
            <textarea
              value={guardrails}
              onChange={(e) => setGuardrails(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Workspace-specific voice rules..."
            />
          </div>

          {workspaceType === 'personal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Personal Rules <span className="text-gray-400 font-normal">(personal workspaces only)</span></label>
              <textarea
                value={personalRules}
                onChange={(e) => setPersonalRules(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Additional personal voice rules, villain framing, narrative context..."
              />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Update Profile' : 'Create Profile'}
            </button>
            {profiles.length > 0 && (
              <button onClick={resetForm} className="px-4 py-2 text-gray-600 text-sm rounded-md hover:bg-gray-100">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PillarsTab({ workspaceId, saving, setSaving, showMessage }) {
  const { pillars, loading, create, update, remove } = useContentPillars(workspaceId)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [keywords, setKeywords] = useState([])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const resetForm = () => {
    setName('')
    setDescription('')
    setKeywords([])
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    if (editingId) {
      await update(editingId, { name: name.trim(), description, keywords })
    } else {
      await create({ name: name.trim(), description, keywords })
    }
    setSaving(false)
    showMessage(editingId ? 'Pillar updated' : 'Pillar created')
    resetForm()
  }

  const startEdit = (pillar) => {
    setEditingId(pillar.id)
    setName(pillar.name)
    setDescription(pillar.description || '')
    setKeywords(pillar.keywords || [])
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this pillar?')) return
    await remove(id)
    showMessage('Pillar deleted')
  }

  const handlePasteApply = async (parsed) => {
    if (!parsed.content_pillars?.length) return
    const existingNames = new Set(pillars.map(p => p.name.toLowerCase()))
    let added = 0
    for (const pillar of parsed.content_pillars) {
      if (!existingNames.has(pillar.name.toLowerCase())) {
        await create({ name: pillar.name, description: pillar.description || '', keywords: pillar.keywords || [] })
        added++
      }
    }
    showMessage(`${added} pillar(s) created`)
  }

  return (
    <div className="max-w-2xl">
      <PasteAndParse workspaceId={workspaceId} section="pillars" onApply={handlePasteApply} />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Content Pillars</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="text-sm text-indigo-600 hover:text-indigo-800">
            + Add Pillar
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. GTM Complexity Trap" autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What this pillar covers..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
            <TagInput tags={keywords} onChange={setKeywords} placeholder="Add keyword" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 text-sm rounded-md hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {pillars.map((pillar) => (
          <div key={pillar.id} className="bg-white border border-gray-200/80 shadow-sm rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-gray-900">{pillar.name}</h3>
                {pillar.description && <p className="text-sm text-gray-500 mt-1">{pillar.description}</p>}
                {pillar.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pillar.keywords.map((kw, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kw}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(pillar)} className="text-sm text-indigo-600 hover:text-indigo-800">Edit</button>
                <button onClick={() => handleDelete(pillar.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {pillars.length === 0 && <p className="text-sm text-gray-500">No pillars yet.</p>}
      </div>
    </div>
  )
}

const COLOUR_OPTIONS = [
  { value: 'red', label: 'Red', cls: 'bg-red-100 text-red-700' },
  { value: 'blue', label: 'Blue', cls: 'bg-blue-100 text-blue-700' },
  { value: 'green', label: 'Green', cls: 'bg-green-100 text-green-700' },
  { value: 'purple', label: 'Purple', cls: 'bg-purple-100 text-purple-700' },
  { value: 'yellow', label: 'Yellow', cls: 'bg-yellow-100 text-yellow-700' },
  { value: 'indigo', label: 'Indigo', cls: 'bg-indigo-100 text-indigo-700' },
  { value: 'amber', label: 'Amber', cls: 'bg-amber-100 text-amber-700' },
  { value: 'teal', label: 'Teal', cls: 'bg-teal-100 text-teal-700' },
  { value: 'gray', label: 'Grey', cls: 'bg-gray-100 text-gray-700' },
]

function ContentStylesTab({ workspaceId, saving, setSaving, showMessage }) {
  const [styles, setStyles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [subcategoryKey, setSubcategoryKey] = useState('')
  const [guidance, setGuidance] = useState('')
  const [colour, setColour] = useState('gray')
  const [sortOrder, setSortOrder] = useState(0)

  const fetchStyles = async () => {
    const { data } = await supabase
      .from('content_styles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order')
    setStyles(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchStyles() }, [workspaceId])

  const resetForm = () => {
    setCategory('')
    setSubcategory('')
    setSubcategoryKey('')
    setGuidance('')
    setColour('gray')
    setSortOrder(styles.length + 1)
    setShowForm(false)
    setEditingId(null)
  }

  const autoKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!category.trim() || !subcategory.trim() || !guidance.trim()) return
    setSaving(true)
    const key = subcategoryKey.trim() || autoKey(subcategory)
    const record = {
      workspace_id: workspaceId,
      category: category.trim(),
      subcategory: subcategory.trim(),
      subcategory_key: key,
      guidance: guidance.trim(),
      colour,
      sort_order: sortOrder,
    }
    if (editingId) {
      await supabase.from('content_styles').update(record).eq('id', editingId)
    } else {
      await supabase.from('content_styles').insert(record)
    }
    setSaving(false)
    showMessage(editingId ? 'Style updated' : 'Style created')
    resetForm()
    fetchStyles()
  }

  const startEdit = (s) => {
    setEditingId(s.id)
    setCategory(s.category)
    setSubcategory(s.subcategory)
    setSubcategoryKey(s.subcategory_key)
    setGuidance(s.guidance)
    setColour(s.colour)
    setSortOrder(s.sort_order)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this content style?')) return
    await supabase.from('content_styles').delete().eq('id', id)
    showMessage('Style deleted')
    fetchStyles()
  }

  const addPreset = async (preset) => {
    setSaving(true)
    const existing = styles.map(s => s.subcategory_key)
    let order = styles.length
    for (const item of preset) {
      if (!existing.includes(item.subcategory_key)) {
        order++
        await supabase.from('content_styles').insert({
          workspace_id: workspaceId,
          ...item,
          sort_order: order,
        })
      }
    }
    setSaving(false)
    showMessage('Preset styles added')
    fetchStyles()
  }

  const PRESET_CLASSIC = [
    { category: 'Format', subcategory: 'Pain', subcategory_key: 'pain', guidance: 'Identify an ICP pain point and agitate the problem. Make the reader feel seen. No solution selling - just nail the problem.', colour: 'red' },
    { category: 'Format', subcategory: 'Proof', subcategory_key: 'proof', guidance: 'Results, case studies, specific numbers. Show do not tell. Concrete outcomes with context.', colour: 'green' },
    { category: 'Format', subcategory: 'Behind the Scenes', subcategory_key: 'bts', guidance: 'Process, how we do things, operational transparency. Pull back the curtain on real work.', colour: 'yellow' },
    { category: 'Format', subcategory: 'Insight', subcategory_key: 'insight', guidance: 'Hot take, industry observation, contrarian POV. Paragraph-based style. Take a strong position.', colour: 'blue' },
  ]

  if (loading) return <div className="text-gray-500">Loading...</div>

  // Group by category for display
  const grouped = styles.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  const colourCls = (c) => COLOUR_OPTIONS.find(o => o.value === c)?.cls || 'bg-gray-100 text-gray-700'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Content Styles</h3>
          <p className="text-xs text-gray-400 mt-0.5">Define the types of content that can be generated for this workspace</p>
        </div>
        <div className="flex gap-2">
          {styles.length === 0 && (
            <button
              onClick={() => addPreset(PRESET_CLASSIC)}
              className="px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
            >
              Add Pain/Proof/BTS/Insight
            </button>
          )}
          <button
            onClick={() => { resetForm(); setSortOrder(styles.length + 1); setShowForm(true) }}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Add Style
          </button>
        </div>
      </div>

      {/* Existing styles grouped by category */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">{cat}</span>
            <span className="text-xs text-gray-400 ml-2">{items.length} style{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map(s => (
              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${colourCls(s.colour)}`}>{s.subcategory}</span>
                    <span className="text-xs text-gray-400 font-mono">{s.subcategory_key}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{s.guidance}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(s)} className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {styles.length === 0 && !showForm && (
        <div className="text-center py-8 text-sm text-gray-400">
          No content styles configured. Add styles or use a preset to get started.
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-gray-700">{editingId ? 'Edit Style' : 'New Style'}</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. Pipeline, Format, Authority"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {[...new Set(styles.map(s => s.category))].map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subcategory</label>
              <input
                value={subcategory}
                onChange={(e) => { setSubcategory(e.target.value); if (!editingId) setSubcategoryKey(autoKey(e.target.value)) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. Decision Story, Pain"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Key <span className="text-gray-400">(auto-generated)</span></label>
              <input
                value={subcategoryKey}
                onChange={(e) => setSubcategoryKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                placeholder="decision_story"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Colour</label>
                <select value={colour} onChange={(e) => setColour(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                  {COLOUR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Guidance <span className="text-gray-400">(used in generation prompt)</span></label>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Describe what this content style should achieve, the tone, structure, and purpose..."
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Update Style' : 'Create Style'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 text-sm rounded-md hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function IcpTab({ workspaceId, saving, setSaving, showMessage }) {
  const { config, loading, upsert } = useIcpConfig(workspaceId)
  const [jobTitles, setJobTitles] = useState([])
  const [industries, setIndustries] = useState([])
  const [painPoints, setPainPoints] = useState([])
  const [competitors, setCompetitors] = useState([])

  useEffect(() => {
    if (config) {
      setJobTitles(config.job_titles || [])
      setIndustries(config.industries || [])
      setPainPoints(config.pain_points || [])
      setCompetitors(config.competitors || [])
    }
  }, [config])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const handleSave = async () => {
    setSaving(true)
    await upsert({ job_titles: jobTitles, industries, pain_points: painPoints, competitors })
    setSaving(false)
    showMessage('ICP config saved')
  }

  const handlePasteApply = async (parsed) => {
    if (!parsed.icp_config) return
    const icp = parsed.icp_config
    if (icp.job_titles?.length) setJobTitles(prev => [...new Set([...prev, ...icp.job_titles])])
    if (icp.industries?.length) setIndustries(prev => [...new Set([...prev, ...icp.industries])])
    if (icp.pain_points?.length) setPainPoints(prev => [...new Set([...prev, ...icp.pain_points])])
    showMessage('ICP fields updated from paste - click Save to persist')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PasteAndParse workspaceId={workspaceId} section="icp" onApply={handlePasteApply} />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
        <TagInput tags={jobTitles} onChange={setJobTitles} placeholder="e.g. Founder, CEO, CTO" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Industries</label>
        <TagInput tags={industries} onChange={setIndustries} placeholder="e.g. B2B SaaS, FinTech" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Pain Points</label>
        <TagInput tags={painPoints} onChange={setPainPoints} placeholder="e.g. No pipeline, Over-engineered GTM" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Competitors</label>
        <TagInput tags={competitors} onChange={setCompetitors} placeholder="e.g. HubSpot, ServiceNow, Lansweeper" />
      </div>
      <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save ICP Config'}
      </button>
    </div>
  )
}
function FeedbackTab({ workspaceId }) {
  const [analysing, setAnalysing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)

  const handleAnalyse = async () => {
    setAnalysing(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyse-feedback', {
        body: { workspaceId },
      })
      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)
      setFeedback(data)
    } catch (err) {
      setError(err.message)
    }
    setAnalysing(false)
  }

  const StatTable = ({ title, stats }) => {
    const entries = Object.entries(stats)
    if (entries.length === 0) return null
    return (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
        <div className="bg-white border border-gray-200/80 shadow-sm rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-center px-3 py-2 font-medium">Total</th>
                <th className="text-center px-3 py-2 font-medium">Minor</th>
                <th className="text-center px-3 py-2 font-medium">Heavy</th>
                <th className="text-center px-3 py-2 font-medium">Rejected</th>
                <th className="text-center px-3 py-2 font-medium">Avg Edit %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(([name, s]) => (
                <tr key={name}>
                  <td className="px-4 py-2 font-medium text-gray-900">{getPostTypeLabel(name)}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{s.total}</td>
                  <td className="px-3 py-2 text-center text-green-600">{s.minor_edit}</td>
                  <td className="px-3 py-2 text-center text-amber-600">{s.heavy_rewrite}</td>
                  <td className="px-3 py-2 text-center text-red-600">{s.rejected}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{s.avgEditDistance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Feedback Analysis</h2>
        <button
          onClick={handleAnalyse}
          disabled={analysing}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {analysing ? 'Analysing...' : 'Analyse Patterns'}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Analyses your editing and rejection patterns to suggest voice profile improvements.
      </p>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}

      {feedback && feedback.totalEdits === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No edit history yet. Edit or reject some generated posts first, then come back here.
        </div>
      )}

      {feedback && feedback.totalEdits > 0 && (
        <>
          <div className="mb-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600">
            Based on {feedback.totalEdits} edit{feedback.totalEdits !== 1 ? 's' : ''} across all content.
          </div>

          <StatTable title="By Post Type" stats={feedback.postTypeStats} />
          <StatTable title="By Pillar" stats={feedback.pillarStats} />

          {feedback.rejectionThemes?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Rejection Themes</h3>
              <div className="flex flex-wrap gap-2">
                {feedback.rejectionThemes.map((theme, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {feedback.suggestions?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Suggested Refinements</h3>
              <div className="space-y-2">
                {feedback.suggestions.map((suggestion, i) => (
                  <div key={i} className="bg-white border border-gray-200/80 shadow-sm rounded-lg p-3 flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-800">{suggestion}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(suggestion)
                      }}
                      className="shrink-0 px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feedback.voiceDrift && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Voice Drift Check</h3>
              <div className={`rounded-lg p-4 border ${
                feedback.voiceDrift.driftLevel === 'none' ? 'bg-green-50 border-green-200' :
                feedback.voiceDrift.driftLevel === 'minor' ? 'bg-yellow-50 border-yellow-200' :
                feedback.voiceDrift.driftLevel === 'moderate' ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    feedback.voiceDrift.driftLevel === 'none' ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200/60' :
                    feedback.voiceDrift.driftLevel === 'minor' ? 'bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200/60' :
                    feedback.voiceDrift.driftLevel === 'moderate' ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60' :
                    'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/60'
                  }`}>
                    {feedback.voiceDrift.driftLevel} drift
                  </span>
                </div>
                <p className={`text-sm mb-3 ${
                  feedback.voiceDrift.driftLevel === 'none' ? 'text-green-700' :
                  feedback.voiceDrift.driftLevel === 'minor' ? 'text-yellow-700' :
                  feedback.voiceDrift.driftLevel === 'moderate' ? 'text-amber-700' :
                  'text-red-700'
                }`}>
                  {feedback.voiceDrift.driftDirection}
                </p>
                {feedback.voiceDrift.specificShifts?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Specific shifts detected:</p>
                    <ul className="space-y-1">
                      {feedback.voiceDrift.specificShifts.map((shift, i) => (
                        <li key={i} className="text-xs text-gray-600 flex gap-2">
                          <span className="text-gray-400">-</span>
                          {shift}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-gray-500 italic">{feedback.voiceDrift.recommendation}</p>
              </div>
            </div>
          )}

          {!feedback.voiceDrift && feedback.totalEdits > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400">Voice drift check requires 5+ generated posts and example posts in the voice profile.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- Paste text + AI parse for individual tabs ---

function PasteAndParse({ workspaceId, section, onApply }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState(null)

  const sectionLabels = {
    voice: 'voice profile (tone, guardrails, example posts)',
    icp: 'ICP config (job titles, industries, pain points)',
    pillars: 'content pillars (topics, themes, keywords)',
  }

  const handleParse = async () => {
    if (!text.trim()) return
    setParsing(true)
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('parse-workspace-upload', {
        body: { workspace_id: workspaceId, file_text: text, file_name: `Pasted text (${section})` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const sectionData = section === 'voice' ? data.parsed.voice_profile
        : section === 'icp' ? data.parsed.icp_config
        : section === 'pillars' ? data.parsed.content_pillars
        : null

      setResult({ data: sectionData, full: data.parsed })
    } catch (err) {
      setResult({ error: err.message })
    }
    setParsing(false)
  }

  const handleApply = () => {
    if (!result?.full) return
    onApply(result.full)
    setResult(null)
    setText('')
    setOpen(false)
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 transition-colors ${
          open
            ? 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Paste text to auto-populate
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Paste any text and the system will extract {sectionLabels[section]} automatically.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste client brief, about page, brand doc, or any relevant text..."
            rows={4}
            className="w-full text-xs px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-2"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleParse}
              disabled={parsing || !text.trim()}
              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {parsing ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Parsing...
                </>
              ) : 'Parse and extract'}
            </button>
            <button onClick={() => { setOpen(false); setText(''); setResult(null) }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          {result?.error && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">{result.error}</div>
          )}

          {result?.full && (
            <div className="mt-3 p-3 rounded-md border border-violet-200 bg-violet-50/50 dark:border-violet-500/20 dark:bg-violet-500/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">Extracted data</span>
                <button
                  onClick={handleApply}
                  className="text-xs px-3 py-1 bg-violet-600 text-white rounded hover:bg-violet-700"
                >
                  Apply
                </button>
              </div>
              {result.data ? (
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-gray-500">No {sectionLabels[section]} found in the text. The full parse may contain data for other sections.</p>
              )}
              {result.full.summary && (
                <p className="text-xs text-gray-400 mt-2 italic">{result.full.summary}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- File upload + AI parse component ---

function FileUploadParser({ workspaceId, showMessage }) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [applying, setApplying] = useState(false)
  const [sectionToggles, setSectionToggles] = useState({})
  const [dragOver, setDragOver] = useState(false)

  const ACCEPT = '.pdf,.md,.csv,.docx,.doc,.txt'

  const extractText = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'md' || ext === 'txt' || ext === 'csv') {
      return await file.text()
    }

    if (ext === 'pdf') {
      if (!window.pdfjsLib) {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        document.head.appendChild(script)
        await new Promise(r => { script.onload = r; script.onerror = () => r() })
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      }
      if (!window.pdfjsLib) throw new Error('Failed to load PDF parser')
      const buf = await file.arrayBuffer()
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(it => it.str).join(' ') + '\n'
      }
      return text
    }

    if (ext === 'docx' || ext === 'doc') {
      if (!window.mammoth) {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
        document.head.appendChild(script)
        await new Promise(r => { script.onload = r; script.onerror = () => r() })
      }
      if (!window.mammoth) throw new Error('Failed to load DOCX parser')
      const buf = await file.arrayBuffer()
      const result = await window.mammoth.extractRawText({ arrayBuffer: buf })
      return result.value
    }

    throw new Error(`Unsupported file type: .${ext}`)
  }

  const handleFiles = async (files) => {
    if (files.length === 0) return
    setParsing(true)
    setParsed(null)

    try {
      let allText = ''
      const fileNames = []
      for (const file of files) {
        const text = await extractText(file)
        allText += `\n--- FILE: ${file.name} ---\n${text}\n`
        fileNames.push(file.name)
      }

      const { data, error } = await supabase.functions.invoke('parse-workspace-upload', {
        body: { workspace_id: workspaceId, file_text: allText, file_name: fileNames.join(', ') },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setParsed(data.parsed)
      const toggles = {}
      if (data.parsed.voice_profile) toggles.voice = true
      if (data.parsed.icp_config) toggles.icp = true
      if (data.parsed.content_pillars?.length) toggles.pillars = true
      setSectionToggles(toggles)
    } catch (err) {
      showMessage(`Parse failed: ${err.message}`)
    }
    setParsing(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles([...e.dataTransfer.files])
  }

  const handleApply = async () => {
    if (!parsed) return
    setApplying(true)

    try {
      if (sectionToggles.voice && parsed.voice_profile) {
        const vp = parsed.voice_profile
        const { data: existing } = await supabase
          .from('voice_profiles')
          .select('id, tone_descriptors, guardrails, example_posts')
          .eq('workspace_id', workspaceId)
          .limit(1)
          .single()

        if (existing) {
          const updates = {}
          if (vp.tone_descriptors?.length) {
            updates.tone_descriptors = [...new Set([...(existing.tone_descriptors || []), ...vp.tone_descriptors])]
          }
          if (vp.guardrails) {
            updates.guardrails = existing.guardrails
              ? existing.guardrails + '\n\n=== IMPORTED FROM UPLOAD ===\n' + vp.guardrails
              : vp.guardrails
          }
          if (vp.example_posts?.length) {
            updates.example_posts = [...(existing.example_posts || []), ...vp.example_posts]
          }
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString()
            await supabase.from('voice_profiles').update(updates).eq('id', existing.id)
          }
        }
      }

      if (sectionToggles.icp && parsed.icp_config) {
        const icp = parsed.icp_config
        const { data: existing } = await supabase
          .from('icp_configs')
          .select('id, job_titles, industries, pain_points')
          .eq('workspace_id', workspaceId)
          .single()

        if (existing) {
          const updates = { updated_at: new Date().toISOString() }
          if (icp.job_titles?.length) updates.job_titles = [...new Set([...(existing.job_titles || []), ...icp.job_titles])]
          if (icp.industries?.length) updates.industries = [...new Set([...(existing.industries || []), ...icp.industries])]
          if (icp.pain_points?.length) updates.pain_points = [...new Set([...(existing.pain_points || []), ...icp.pain_points])]
          await supabase.from('icp_configs').update(updates).eq('id', existing.id)
        } else {
          await supabase.from('icp_configs').insert({
            workspace_id: workspaceId,
            job_titles: icp.job_titles || [],
            industries: icp.industries || [],
            pain_points: icp.pain_points || [],
          })
        }
      }

      if (sectionToggles.pillars && parsed.content_pillars?.length) {
        const { data: existing } = await supabase
          .from('content_pillars')
          .select('name')
          .eq('workspace_id', workspaceId)

        const existingNames = new Set((existing || []).map(p => p.name.toLowerCase()))

        for (const pillar of parsed.content_pillars) {
          if (!existingNames.has(pillar.name.toLowerCase())) {
            await supabase.from('content_pillars').insert({
              workspace_id: workspaceId,
              name: pillar.name,
              description: pillar.description || '',
              keywords: pillar.keywords || [],
            })
          }
        }
      }

      showMessage('Profile updated from upload')
      setParsed(null)
      setOpen(false)
      window.location.reload()
    } catch (err) {
      showMessage(`Apply failed: ${err.message}`)
    }
    setApplying(false)
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
          open
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Upload files to auto-populate
      </button>

      {open && (
        <div className="mt-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {!parsed && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Upload PDF, DOCX, CSV, MD, or TXT files. The system will read the content and suggest how to populate the workspace profile.
              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragOver
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {parsing ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                    <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                    Parsing files and extracting profile data...
                  </div>
                ) : (
                  <>
                    <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Drag files here or click to browse</p>
                    <input
                      type="file"
                      accept={ACCEPT}
                      multiple
                      onChange={(e) => handleFiles([...e.target.files])}
                      className="hidden"
                      id="workspace-upload"
                    />
                    <label
                      htmlFor="workspace-upload"
                      className="inline-block px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 cursor-pointer"
                    >
                      Choose files
                    </label>
                    <p className="text-xs text-gray-400 mt-2">PDF, DOCX, DOC, CSV, MD, TXT</p>
                  </>
                )}
              </div>
            </>
          )}

          {parsed && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Extracted profile data</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleApply}
                    disabled={applying || !Object.values(sectionToggles).some(Boolean)}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {applying ? 'Applying...' : 'Apply selected'}
                  </button>
                  <button onClick={() => setParsed(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                    Discard
                  </button>
                </div>
              </div>

              {parsed.summary && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 italic">{parsed.summary}</p>
              )}

              <div className="space-y-3">
                {parsed.voice_profile && (
                  <ParsedSection label="Voice Profile" enabled={sectionToggles.voice} onToggle={() => setSectionToggles(p => ({ ...p, voice: !p.voice }))}>
                    {parsed.voice_profile.tone_descriptors?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs font-medium text-gray-500">Tone: </span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{parsed.voice_profile.tone_descriptors.join(', ')}</span>
                      </div>
                    )}
                    {parsed.voice_profile.guardrails && (
                      <div className="mb-2">
                        <span className="text-xs font-medium text-gray-500">Guardrails: </span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{parsed.voice_profile.guardrails.substring(0, 300)}{parsed.voice_profile.guardrails.length > 300 ? '...' : ''}</span>
                      </div>
                    )}
                    {parsed.voice_profile.example_posts?.length > 0 && (
                      <span className="text-xs font-medium text-gray-500">{parsed.voice_profile.example_posts.length} example post(s) found</span>
                    )}
                  </ParsedSection>
                )}

                {parsed.icp_config && (
                  <ParsedSection label="ICP Config" enabled={sectionToggles.icp} onToggle={() => setSectionToggles(p => ({ ...p, icp: !p.icp }))}>
                    {parsed.icp_config.job_titles?.length > 0 && (
                      <div className="mb-1"><span className="text-xs font-medium text-gray-500">Job titles: </span><span className="text-xs text-gray-700 dark:text-gray-300">{parsed.icp_config.job_titles.join(', ')}</span></div>
                    )}
                    {parsed.icp_config.industries?.length > 0 && (
                      <div className="mb-1"><span className="text-xs font-medium text-gray-500">Industries: </span><span className="text-xs text-gray-700 dark:text-gray-300">{parsed.icp_config.industries.join(', ')}</span></div>
                    )}
                    {parsed.icp_config.pain_points?.length > 0 && (
                      <div><span className="text-xs font-medium text-gray-500">Pain points: </span><span className="text-xs text-gray-700 dark:text-gray-300">{parsed.icp_config.pain_points.join(', ')}</span></div>
                    )}
                  </ParsedSection>
                )}

                {parsed.content_pillars?.length > 0 && (
                  <ParsedSection label="Content Pillars" enabled={sectionToggles.pillars} onToggle={() => setSectionToggles(p => ({ ...p, pillars: !p.pillars }))}>
                    {parsed.content_pillars.map((p, i) => (
                      <div key={i} className="mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.name}</span>
                        {p.description && <span className="text-xs text-gray-500"> — {p.description}</span>}
                        {p.keywords?.length > 0 && <span className="text-xs text-gray-400"> [{p.keywords.join(', ')}]</span>}
                      </div>
                    ))}
                  </ParsedSection>
                )}

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ParsedSection({ label, enabled, onToggle, children }) {
  return (
    <div className={`rounded-md border p-3 transition-colors ${
      enabled
        ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/20 dark:bg-indigo-500/5'
        : 'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30 opacity-60'
    }`}>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={onToggle} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      </label>
      {children}
    </div>
  )
}
