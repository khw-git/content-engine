import { Link } from 'react-router-dom'

export default function WorkspaceCard({ workspace }) {
  return (
    <Link
      to={`/workspaces/${workspace.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900">{workspace.name}</h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          workspace.type === 'personal'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {workspace.type}
        </span>
      </div>
      <p className="text-sm text-gray-500">
        Created {new Date(workspace.created_at).toLocaleDateString()}
      </p>
    </Link>
  )
}
