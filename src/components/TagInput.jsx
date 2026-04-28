import { useState } from 'react'

export default function TagInput({ tags = [], onChange, placeholder = 'Add item and press Enter' }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const value = input.trim()
    if (value && !tags.includes(value)) {
      onChange([...tags, value])
    }
    setInput('')
  }

  const removeTag = (index) => {
    onChange(tags.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-sm">
            {tag}
            <button onClick={() => removeTag(i)} className="text-indigo-400 hover:text-indigo-600 ml-0.5">&times;</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  )
}
