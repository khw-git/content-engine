import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useReviewQueue } from '../hooks/useReviewQueue'
import DesignBriefDisplay from '../components/DesignBriefDisplay'
import RefinePanel from '../components/RefinePanel'
import { getPostTypeLabel } from '../lib/postTypeUtils'

const STATUS_LABELS = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  pushed: 'Pushed',
  rejected: 'Rejected',
  used: 'Used',
}

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  in_review: 'bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200/60',
  approved: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200/60',
  pushed: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60',
  rejected: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/60',
  used: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
}

const TABS = [
  { key: 'queue', label: 'Queue' },
  { key: 'approved', label: 'Approved' },
  { key: 'history', label: 'History' },
]

export default function ReviewQueue() {
  const [workspaces, setWorkspaces] = useState([])
  const [filterWorkspace, setFilterWorkspace] = useState('')
  const [filterPostType, setFilterPostType] = useState('')
  const [activeTab, setActiveTab] = useState('queue')
  const [batchMode, setBatchMode] = useState(false)
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [bulkActing, setBulkActing] = useState(false)
  const [bulkPushProgress, setBulkPushProgress] = useState(null)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(new Set())
  const bulkActionsRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bulkActionsRef.current && !bulkActionsRef.current.contains(e.target)) {
        setShowBulkActions(false)
      }
    }
    if (showBulkActions) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBulkActions])

  // Build filters based on active tab
  const filters = {}
  if (filterWorkspace) filters.workspaceId = filterWorkspace
  if (filterPostType) filters.postType = filterPostType

  if (activeTab === 'queue') {
    filters.statuses = ['draft', 'in_review']
  } else if (activeTab === 'approved') {
    filters.statuses = ['approved']
  } else if (activeTab === 'history') {
    filters.statuses = ['pushed', 'used', 'rejected']
  }

  const { items, loading, counts, updateStatus, updateContent, reject, remove, refetch } = useReviewQueue(filters)

  // Mark an item as complete (sets status to pushed with timestamp)
  const markComplete = async (id) => {
    await supabase.from('generated_content')
      .update({ status: 'pushed', pushed_at: new Date().toISOString() })
      .eq('id', id)
  }

  useEffect(() => {
    if (!supabase) return
    supabase.from('workspaces').select('id, name').order('created_at')
      .then(({ data }) => setWorkspaces(data || []))
  }, [])

  const pendingCount = counts.draft + counts.in_review
  const batchItems = items.filter(i => i.status === 'draft' || i.status === 'in_review')

  const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id))
  const someSelected = selectedIds.size > 0

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const selectedItems = items.filter(i => selectedIds.has(i.id))

  // Bulk mark complete
  const handleBulkComplete = async (itemsToComplete) => {
    if (itemsToComplete.length === 0) return
    for (const item of itemsToComplete) {
      await markComplete(item.id)
    }
    refetch()
  }

  const handleBulkAction = async (action) => {
    setShowBulkActions(false)
    if (selectedItems.length === 0) return
    setBulkActing(true)

    if (action === 'approve') {
      for (const item of selectedItems) {
        if (item.status !== 'approved' && item.status !== 'pushed') {
          await updateStatus(item.id, 'approved')
        }
      }
    } else if (action === 'approve_and_complete') {
      for (const item of selectedItems) {
        if (item.status === 'pushed' || item.status === 'used') continue
        if (item.status !== 'approved') {
          await updateStatus(item.id, 'approved')
        }
        await markComplete(item.id)
      }
    } else if (action === 'move_to_review') {
      for (const item of selectedItems) {
        if (item.status !== 'in_review' && item.status !== 'pushed') {
          await updateStatus(item.id, 'in_review')
        }
      }
    } else if (action === 'reject') {
      for (const item of selectedItems) {
        if (item.status !== 'rejected' && item.status !== 'pushed') {
          await reject(item.id, '')
        }
      }
    } else if (action === 'move_to_draft') {
      for (const item of selectedItems) {
        if (item.status !== 'draft' && item.status !== 'pushed') {
          await updateStatus(item.id, 'draft')
        }
      }
    } else if (action === 'mark_used') {
      for (const item of selectedItems) {
        if (item.status === 'pushed') {
          await updateStatus(item.id, 'used')
        }
      }
    } else if (action === 'delete') {
      if (!confirm(`Permanently delete ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}?`)) {
        setBulkActing(false)
        return
      }
      for (const item of selectedItems) {
        await remove(item.id)
      }
    } else if (action === 'push_to_history') {
      for (const item of selectedItems) {
        if (item.status === 'approved') {
          await markComplete(item.id)
        }
      }
    } else if (action === 'mark_complete') {
      for (const item of selectedItems) {
        if (item.status === 'approved') {
          await markComplete(item.id)
        }
      }
    }

    setSelectedIds(new Set())
    setBulkActing(false)
    refetch()
  }

  if (loading) return <div className="text-gray-500 py-16 text-center">Loading...</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">{pendingCount} item{pendingCount !== 1 ? 's' : ''} pending review</p>
          )}
        </div>
        <div className="flex gap-2">
          {activeTab === 'approved' && items.length > 0 && (
            <button
              onClick={async () => {
                for (const it of items) await markComplete(it.id)
                refetch()
              }}
              className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Mark All Complete ({items.length})
            </button>
          )}
          {activeTab === 'queue' && batchItems.length > 0 && (
            <button
              onClick={() => { setBatchMode(!batchMode); setBatchIndex(0) }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                batchMode
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {batchMode ? 'Exit Batch Review' : `Batch Review (${batchItems.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(tab => {
          const tabCount = tab.key === 'queue' ? counts.draft + counts.in_review
            : tab.key === 'approved' ? counts.approved
            : counts.pushed + counts.used + counts.rejected
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setBatchMode(false); setSelectedIds(new Set()); setBulkPushProgress(null) }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tabCount > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.key ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200/60' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tabCount}
                </span>
              )}
            </button>
          )
        })}
      </div>


      {/* Filters */}
      {!batchMode && (
        <div className="flex gap-3 mb-6">
          <select value={filterWorkspace} onChange={(e) => setFilterWorkspace(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All workspaces</option>
            {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
          </select>
          <select value={filterPostType} onChange={(e) => setFilterPostType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All types</option>
            {[...new Set(items.map(i => i.post_type))].map(k => <option key={k} value={k}>{getPostTypeLabel(k)}</option>)}
          </select>
        </div>
      )}

      {/* Batch mode */}
      {batchMode && batchItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{batchIndex + 1} of {batchItems.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setBatchIndex(Math.max(0, batchIndex - 1))} disabled={batchIndex === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                Previous
              </button>
              <button onClick={() => setBatchIndex(Math.min(batchItems.length - 1, batchIndex + 1))} disabled={batchIndex >= batchItems.length - 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
          <ReviewItem
            item={batchItems[batchIndex]}
            updateStatus={updateStatus}
            updateContent={updateContent}
            reject={reject}
            remove={remove}
            markComplete={markComplete}
            onComplete={handleBulkComplete}
            onAction={() => {
              refetch()
              if (batchIndex >= batchItems.length - 1) setBatchIndex(Math.max(0, batchIndex - 1))
            }}
          />
        </div>
      )}

      {batchMode && batchItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">No items pending review.</div>
      )}

      {/* Selection bar */}
      {!batchMode && items.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          {someSelected && (
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
          )}
          {someSelected && (
            <div className="relative ml-auto" ref={bulkActionsRef}>
              <button
                onClick={() => setShowBulkActions(!showBulkActions)}
                disabled={bulkActing}
                className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                {bulkActing ? 'Processing...' : 'Actions'}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showBulkActions && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  {activeTab === 'queue' && (
                    <>
                      <button onClick={() => handleBulkAction('approve')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Approve
                      </button>
                      <button onClick={() => handleBulkAction('approve_and_complete')}
                        className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 font-medium">
                        Approve + Mark Complete
                      </button>
                      <button onClick={() => handleBulkAction('move_to_review')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Move to Review
                      </button>
                      <button onClick={() => handleBulkAction('reject')}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                        Reject
                      </button>
                    </>
                  )}
                  {activeTab === 'approved' && (
                    <>
                      <button onClick={() => handleBulkAction('mark_complete')}
                        className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 font-medium">
                        Mark Complete
                      </button>
                      <button onClick={() => handleBulkAction('push_to_history')}
                        className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                        Push to History
                      </button>
                      <button onClick={() => handleBulkAction('move_to_draft')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Move to Draft
                      </button>
                    </>
                  )}
                  {activeTab === 'history' && (
                    <>
                      <button onClick={() => handleBulkAction('mark_used')}
                        className="w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50">
                        Mark as Used
                      </button>
                      <button onClick={() => handleBulkAction('move_to_draft')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Move to Draft
                      </button>
                    </>
                  )}
                  <button onClick={() => handleBulkAction('delete')}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* List mode — grouped by workspace */}
      {!batchMode && (
        <div className="space-y-4">
          {(() => {
            // Group items by workspace
            const groups = {}
            const order = []
            for (const item of items) {
              const wsId = item.workspace_id
              if (!groups[wsId]) {
                groups[wsId] = { name: item.workspaces?.name || 'Unknown', items: [] }
                order.push(wsId)
              }
              groups[wsId].items.push(item)
            }

            // If only 1 workspace, render flat (no grouping needed)
            if (order.length <= 1) {
              return items.map(item => (
                <ReviewItem
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  updateStatus={updateStatus}
                  updateContent={updateContent}
                  reject={reject}
                  remove={remove}
                  markComplete={markComplete}
                  onComplete={handleBulkComplete}
                  onAction={refetch}
                  isHistory={activeTab === 'history'}
                />
              ))
            }

            return order.map(wsId => {
              const group = groups[wsId]
              const isExpanded = expandedWorkspaces.has(wsId)
              const wsSelectedCount = group.items.filter(i => selectedIds.has(i.id)).length

              return (
                <div key={wsId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setExpandedWorkspaces(prev => {
                        const next = new Set(prev)
                        if (next.has(wsId)) next.delete(wsId)
                        else next.add(wsId)
                        return next
                      })
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{group.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {group.items.length} post{group.items.length !== 1 ? 's' : ''}
                    </span>
                    {wsSelectedCount > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">
                        {wsSelectedCount} selected
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.items.map(item => (
                        <ReviewItem
                          key={item.id}
                          item={item}
                          selected={selectedIds.has(item.id)}
                          onToggleSelect={() => toggleSelect(item.id)}
                          updateStatus={updateStatus}
                          updateContent={updateContent}
                          reject={reject}
                          remove={remove}
                          markComplete={markComplete}
                          onComplete={handleBulkComplete}
                          onAction={refetch}
                          isHistory={activeTab === 'history'}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          })()}
          {items.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {activeTab === 'queue' ? 'No content pending review.' :
               activeTab === 'approved' ? 'No approved content waiting.' :
               'No past posts yet.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewItem({ item, selected, onToggleSelect, updateStatus, updateContent, reject, remove, markComplete, onComplete, onAction, isHistory }) {
  const [collapsed, setCollapsed] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(item.content)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [editResult, setEditResult] = useState(null)
  const [showDesignBriefPicker, setShowDesignBriefPicker] = useState(false)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [localDesignBrief, setLocalDesignBrief] = useState(item.design_brief || null)
  const [briefAbort, setBriefAbort] = useState(null)
  const [lastBriefType, setLastBriefType] = useState(null)
  const [previousBrief, setPreviousBrief] = useState(null)
  const [showRefine, setShowRefine] = useState(false)
  const [selectedText, setSelectedText] = useState('')

  const handleSaveEdit = async () => {
    if (editedContent === item.content) {
      setEditing(false)
      return
    }
    setSaving(true)
    const result = await updateContent(item.id, item.content, editedContent)
    setEditResult(result)
    setSaving(false)
    setEditing(false)
    setTimeout(() => setEditResult(null), 3000)
  }

  const handleApprove = async () => {
    setSaving(true)
    await updateStatus(item.id, 'approved')
    setSaving(false)
    onAction()
  }

  const handleApproveAndComplete = async () => {
    setSaving(true)
    await updateStatus(item.id, 'approved')
    await markComplete(item.id)
    setSaving(false)
    onAction()
  }

  const handleMarkComplete = async () => {
    setSaving(true)
    await markComplete(item.id)
    setSaving(false)
    onAction()
  }


  const handleMoveToReview = async () => {
    setSaving(true)
    await updateStatus(item.id, 'in_review')
    setSaving(false)
    onAction()
  }

  const handleReject = async () => {
    setSaving(true)
    await reject(item.id, rejectReason)
    setSaving(false)
    setShowRejectModal(false)
    setRejectReason('')
    onAction()
  }

  const handleDelete = async () => {
    if (!confirm('Permanently delete this post?')) return
    await remove(item.id)
    onAction()
  }

  const handleGenerateDesignBrief = async (designType) => {
    const controller = new AbortController()
    setBriefAbort(controller)
    setGeneratingBrief(true)
    setShowDesignBriefPicker(false)
    setLastBriefType(designType)
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          voiceProfile: null,
          pillars: [],
          icpConfig: null,
          selectedPillar: { name: item.content_pillars?.name || 'General', keywords: [] },
          postType: item.post_type,
          recentPosts: [],
          includeDesignBrief: true,
          designType,
          workspaceName: item.workspaces?.name || 'Unknown',
          workspaceType: item.workspaces?.type || 'client',
          workspaceId: item.workspace_id,
          existingContent: item.content,
          previousDesignBrief: previousBrief || null,
        },
      })
      if (controller.signal.aborted) return
      if (error) {
        console.error('Design brief error:', error)
      } else if (data?.designBrief) {
        const briefValue = data.designMockup
          ? `${data.designBrief}\n---MOCKUP---\n${data.designMockup}`
          : data.designBrief
        setLocalDesignBrief(briefValue)
        // Save to DB without refetching
        await supabase.from('generated_content')
          .update({ design_brief: briefValue })
          .eq('id', item.id)
      }
    } catch {}
    setGeneratingBrief(false)
    setBriefAbort(null)
  }

  const handleRetryBrief = () => {
    setPreviousBrief(localDesignBrief)
    setLocalDesignBrief(null)
    handleGenerateDesignBrief(lastBriefType || 'carousel')
  }

  return (
    <div className={`bg-white border rounded-lg shadow-sm overflow-hidden ${selected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200/80'}`}>
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        )}
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-sm text-gray-900">{item.workspaces?.name}</span>
        {item.voice_profiles?.persona_name && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200/60">{item.voice_profiles.persona_name}</span>
        )}
        <span className="text-sm text-gray-500">{item.content_pillars?.name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200/60">{getPostTypeLabel(item.post_type)}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </span>
        {collapsed && (
          <span className="text-xs text-gray-400 truncate max-w-[200px]">
            {item.content.substring(0, 60)}...
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto flex items-center gap-2">
          {new Date(item.generated_at).toLocaleDateString()}
          {item.pushed_at && (
            <span className="text-blue-400">pushed {new Date(item.pushed_at).toLocaleDateString()}</span>
          )}
          {isHistory && (
            <button
              onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'draft').then(onAction) }}
              className="px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
            >
              Back to Queue
            </button>
          )}
        </span>
      </div>

      {!collapsed && <>
      {/* Content + Refine Panel */}
      <div className={`${showRefine ? 'flex' : ''}`}>
        <div className={`p-4 ${showRefine ? 'flex-1 min-w-0' : ''}`}>
          {editing ? (
            <div>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2 mt-3">
                <button onClick={handleSaveEdit} disabled={saving}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Edit'}
                </button>
                <button onClick={() => { setEditing(false); setEditedContent(item.content) }}
                  className="px-3 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <pre className={`whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed rounded p-2 -m-2 ${
                !isHistory ? 'hover:bg-gray-50 cursor-text' : ''
              }`}
                onMouseUp={() => {
                  setTimeout(() => {
                    const sel = window.getSelection()?.toString()?.trim()
                    if (sel && sel.length > 5) {
                      setSelectedText(sel)
                    } else {
                      setSelectedText('')
                      if (!isHistory && item.status !== 'pushed' && item.status !== 'used') {
                        setEditing(true)
                      }
                    }
                  }, 10)
                }}>
                {item.content}
              </pre>
              {selectedText && <SelectionBar
                text={selectedText}
                onRefine={() => {
                  setShowRefine(true)
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('refine-selection', { detail: selectedText }))
                  }, 100)
                }}
                onClear={() => setSelectedText('')}
              />}
            </>
          )}

          {editResult && (
            <div className={`mt-3 text-xs px-3 py-2 rounded ${
              editResult.editType === 'minor_edit' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
            }`}>
              Edit saved - {editResult.editType === 'minor_edit' ? 'minor tweak' : 'heavy rewrite'} ({editResult.editDistancePct}% changed)
            </div>
          )}

          {generatingBrief && !localDesignBrief && (
            <div className="mt-4 bg-blue-50 rounded-md p-4 flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-blue-700">Generating design brief...</span>
            </div>
          )}
          {localDesignBrief && (
            <div className="flex justify-end mt-2">
              <button
                onClick={handleRetryBrief}
                disabled={generatingBrief}
                className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                Try another brief
              </button>
            </div>
          )}
          <DesignBriefDisplay designBrief={localDesignBrief} />
        </div>

        {showRefine && (
          <div className="w-96 h-[500px] flex-shrink-0">
            <RefinePanel
              contentId={item.id}
              workspaceId={item.workspace_id}
              currentContent={editing ? editedContent : item.content}
              postType={item.post_type}
              pillarName={item.content_pillars?.name}
              voiceProfileId={item.voice_profile_id}
              onApply={(newContent) => {
                setEditedContent(newContent)
                setEditing(true)
              }}
            />
          </div>
        )}
      </div>


      {/* Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center gap-2 flex-wrap">
        {item.status === 'draft' && (
          <>
            <button onClick={handleMoveToReview} disabled={saving}
              className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 disabled:opacity-50">
              Move to Review
            </button>
            <button onClick={handleApprove} disabled={saving}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={handleApproveAndComplete} disabled={saving}
              className="px-3 py-1.5 bg-green-700 text-white text-sm rounded-md hover:bg-green-800 disabled:opacity-50 flex items-center gap-1">
              Approve + Complete
            </button>
            <button onClick={async () => { await handleApprove(); await handleMarkComplete() }} disabled={saving}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Approve + Push to History
            </button>
            <button onClick={() => setShowRejectModal(true)}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50">
              Reject
            </button>
            <button onClick={() => { if (!editing) setEditing(true) }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Edit
            </button>
            <button onClick={handleDelete}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-red-600">
              Delete
            </button>
          </>
        )}
        {item.status === 'in_review' && (
          <>
            <button onClick={handleApprove} disabled={saving}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={handleApproveAndComplete} disabled={saving}
              className="px-3 py-1.5 bg-green-700 text-white text-sm rounded-md hover:bg-green-800 disabled:opacity-50 flex items-center gap-1">
              Approve + Complete
            </button>
            <button onClick={async () => { await handleApprove(); await handleMarkComplete() }} disabled={saving}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Approve + Push to History
            </button>
            <button onClick={() => setShowRejectModal(true)}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50">
              Reject
            </button>
            <button onClick={() => { if (!editing) setEditing(true) }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Edit
            </button>
          </>
        )}
        {item.status === 'approved' && (
          <>
            <button onClick={handleMarkComplete} disabled={saving}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Push to History
            </button>
            <button onClick={() => { if (!editing) setEditing(true) }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Edit
            </button>
            <button onClick={() => updateStatus(item.id, 'draft').then(onAction)}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Move to Draft
            </button>
          </>
        )}
        {item.status === 'pushed' && (
          <>
            <button onClick={() => updateStatus(item.id, 'used').then(onAction)}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700">
              Mark as Used
            </button>
            <button onClick={() => updateStatus(item.id, 'draft').then(onAction)}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Move to Draft
            </button>
          </>
        )}
        {item.status === 'used' && (
          <button onClick={() => updateStatus(item.id, 'draft').then(onAction)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
            Move to Draft
          </button>
        )}
        {item.status === 'rejected' && (
          <>
            <button onClick={() => updateStatus(item.id, 'draft').then(onAction)}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              Move back to Draft
            </button>
            <button onClick={handleDelete}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-red-600">
              Delete
            </button>
          </>
        )}
        {!isHistory && item.status !== 'pushed' && item.status !== 'used' && (
          <button
            onClick={() => setShowRefine(!showRefine)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              showRefine
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'text-purple-600 border border-purple-300 hover:bg-purple-50'
            }`}
          >
            {showRefine ? 'Close Refine' : 'Refine with Claude'}
          </button>
        )}
        {!localDesignBrief && !generatingBrief && (
          <button
            onClick={() => setShowDesignBriefPicker(!showDesignBriefPicker)}
            className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
          >
            + Design Brief
          </button>
        )}
        {generatingBrief && (
          <button
            onClick={() => { briefAbort?.abort(); setGeneratingBrief(false); setBriefAbort(null) }}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 animate-pulse"
          >
            Stop generating
          </button>
        )}
        <button onClick={() => navigator.clipboard.writeText(item.content)}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 ml-auto">
          Copy
        </button>
      </div>

      {/* Design brief picker */}
      {showDesignBriefPicker && (
        <div className="p-4 border-t border-blue-200 bg-blue-50">
          <label className="block text-sm font-medium text-blue-700 mb-3">Choose design type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'carousel', label: 'Carousel' },
              { key: 'infographic', label: 'Infographic' },
              { key: 'workflow', label: 'Workflow Diagram' },
              { key: 'meme', label: 'Meme' },
              { key: 'comparison', label: 'Comparison' },
              { key: 'quote_card', label: 'Quote Card' },
              { key: 'checklist', label: 'Checklist' },
              { key: 'data_viz', label: 'Data Viz' },
              { key: 'screenshot', label: 'Screenshot' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => handleGenerateDesignBrief(opt.key)}
                className="px-3 py-2 text-sm text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowDesignBriefPicker(false)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="p-4 border-t border-red-200 bg-red-50">
          <label className="block text-sm font-medium text-red-700 mb-2">Rejection reason (optional)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            placeholder="e.g. Too generic, doesn't match voice, wrong angle..."
          />
          <div className="flex gap-2">
            <button onClick={handleReject} disabled={saving}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50">
              Confirm Reject
            </button>
            <button onClick={() => { setShowRejectModal(false); setRejectReason('') }}
              className="px-3 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}

function SelectionBar({ text, onRefine, onClear }) {
  const preview = text.length > 40 ? text.substring(0, 40) + '...' : text
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-xs text-gray-400 italic truncate max-w-[200px]">{'\u201C'}{preview}{'\u201D'}</span>
      <button
        onClick={onRefine}
        className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 rounded hover:bg-violet-200 transition-colors flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Refine selection
      </button>
      <button onClick={onClear} className="text-xs text-gray-300 hover:text-gray-500">{'\u00D7'}</button>
    </div>
  )
}
