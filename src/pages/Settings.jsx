import { useState } from 'react'
import { useWorkspaces } from '../hooks/useWorkspaces'

export default function Settings() {
  const { workspaces, loading, restore, permanentDelete } = useWorkspaces({ includeDeleted: true })
  const [confirmPermanent, setConfirmPermanent] = useState(null)

  const deletedWorkspaces = workspaces.filter(ws => ws.deleted_at)

  if (loading) return <div className="text-gray-500 py-16 text-center">Loading...</div>

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Manage your content hub configuration.</p>

      {/* Recently Deleted */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Recently Deleted</h2>
        <p className="text-sm text-gray-500 mb-4">Removed workspaces and all their data are preserved here. Restore them or delete permanently.</p>

        {deletedWorkspaces.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
            No deleted workspaces
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {deletedWorkspaces.map(ws => (
              <div key={ws.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{ws.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ws.type === 'personal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>{ws.type}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Deleted {new Date(ws.deleted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restore(ws.id)}
                    className="px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                  >
                    Restore
                  </button>
                  {confirmPermanent === ws.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => { await permanentDelete(ws.id); setConfirmPermanent(null) }}
                        className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Confirm delete
                      </button>
                      <button
                        onClick={() => setConfirmPermanent(null)}
                        className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmPermanent(ws.id)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      Delete forever
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
