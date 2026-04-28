import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function RefinePanel({ contentId, workspaceId, currentContent, postType, pillarName, voiceProfileId, onApply }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [highlightedText, setHighlightedText] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Listen for selection events from the content area
  useEffect(() => {
    const handler = (e) => {
      const text = e.detail
      if (text) {
        setHighlightedText(text)
        setInput(`Refine this part: "${text}"`)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('refine-selection', handler)
    return () => window.removeEventListener('refine-selection', handler)
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('refine-content', {
        body: {
          contentId,
          workspaceId,
          currentContent,
          postType,
          pillarName,
          voiceProfileId,
          userMessage: text,
          highlightedText: highlightedText || null,
          conversationHistory: messages,
        },
      })
      // Clear highlighted text after sending
      setHighlightedText('')

      if (error) throw new Error(error.message || String(error))
      if (data?.error) throw new Error(data.error)

      setMessages([...updatedMessages, { role: 'assistant', content: data.content }])
    } catch (err) {
      setMessages([...updatedMessages, { role: 'assistant', content: `Error: ${err.message}`, isError: true }])
    }
    setLoading(false)
  }

  const handleApply = async (assistantContent) => {
    // Log that the user applied this refinement
    if (contentId) {
      await supabase
        .from('refinement_log')
        .update({ applied_content: assistantContent, updated_at: new Date().toISOString() })
        .eq('content_id', contentId)
    }
    onApply(assistantContent)
  }

  // Extract a full post from assistant message (look for content between --- markers or the whole message)
  const extractPost = (content) => {
    const markerMatch = content.match(/---\n([\s\S]+?)\n---/)
    if (markerMatch) return markerMatch[1].trim()
    // If the message is mostly a rewrite (long, no leading question), return it
    // Otherwise return null (it's advice, not a rewrite)
    const lines = content.trim().split('\n')
    const nonEmptyLines = lines.filter(l => l.trim())
    // Heuristic: if > 5 lines and doesn't start with common advice patterns, it's probably a rewrite
    if (nonEmptyLines.length >= 5 && !/^(I |Here|Sure|The |Your |This |Let me|A few|Some )/.test(content.trim())) {
      return content.trim()
    }
    return null
  }

  const quickPrompts = [
    'Strengthen the hook',
    'Tighten the language',
    'Make it more direct',
    'Rewrite this post',
  ]

  return (
    <div className="flex flex-col h-full border-l border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <p className="text-sm font-medium text-gray-700">Refine with Claude</p>
        <p className="text-xs text-gray-400">Voice-aware refinement - edits feed back into the content engine</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Ask Claude to help refine this post. It knows your voice profile, ICP, and editing patterns.</p>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                  className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : msg.isError
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-white text-gray-700 border border-gray-200'
            }`}>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</div>
              {msg.role === 'assistant' && !msg.isError && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex gap-2">
                  {extractPost(msg.content) && (
                    <button
                      onClick={() => handleApply(extractPost(msg.content))}
                      className="text-xs font-medium text-green-600 hover:text-green-800"
                    >
                      Apply to post
                    </button>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask Claude to refine..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
