import { useState } from 'react'

export default function DesignBriefDisplay({ designBrief }) {
  const [view, setView] = useState('description')

  if (!designBrief) return null

  // Split description from mockup SVG
  let description = designBrief
  let mockupSvg = null

  if (designBrief.includes('---MOCKUP---')) {
    const parts = designBrief.split('---MOCKUP---')
    description = parts[0].trim()
    const svgMatch = parts[1]?.match(/<svg[\s\S]*?<\/svg>/)
    mockupSvg = svgMatch ? svgMatch[0] : null
  }

  return (
    <div className="mt-4 bg-blue-50 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3">
        <h4 className="text-xs font-medium text-blue-900">Design Brief</h4>
        {mockupSvg && (
          <div className="flex gap-1">
            <button
              onClick={() => setView('description')}
              className={`px-2 py-0.5 text-xs rounded ${
                view === 'description' ? 'bg-blue-200 text-blue-800' : 'text-blue-500 hover:bg-blue-100'
              }`}
            >
              Description
            </button>
            <button
              onClick={() => setView('mockup')}
              className={`px-2 py-0.5 text-xs rounded ${
                view === 'mockup' ? 'bg-blue-200 text-blue-800' : 'text-blue-500 hover:bg-blue-100'
              }`}
            >
              Mockup
            </button>
          </div>
        )}
      </div>
      <div className="p-3">
        {view === 'description' && (
          <pre className="whitespace-pre-wrap font-sans text-xs text-blue-800">{description}</pre>
        )}
        {view === 'mockup' && mockupSvg && (
          <div
            className="bg-white rounded border border-blue-100 p-2 flex justify-center"
            dangerouslySetInnerHTML={{ __html: mockupSvg }}
          />
        )}
      </div>
    </div>
  )
}
