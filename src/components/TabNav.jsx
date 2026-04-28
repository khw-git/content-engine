export default function TabNav({ tabs, active, onChange }) {
  return (
    <div className="border-b border-gray-200/80 dark:border-gray-700 mb-6">
      <nav className="flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.key
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
