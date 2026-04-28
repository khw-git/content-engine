// Fallback labels for display when content_styles aren't loaded
// These cover legacy types and common keys
const FALLBACK_LABELS = {
  pain: 'Pain',
  proof: 'Proof',
  bts: 'Behind the Scenes',
  insight: 'Insight',
}

export function getPostTypeLabel(key, labelMap = {}) {
  if (labelMap[key]) return labelMap[key]
  if (FALLBACK_LABELS[key]) return FALLBACK_LABELS[key]
  // Title-case the key as last resort (e.g. "decision_story" -> "Decision Story")
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Colour classes for post type badges
const COLOUR_CLASSES = {
  indigo: 'bg-indigo-100 text-indigo-700',
  blue: 'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose: 'bg-rose-100 text-rose-700',
  orange: 'bg-orange-100 text-orange-700',
  teal: 'bg-teal-100 text-teal-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  pink: 'bg-pink-100 text-pink-700',
  gray: 'bg-gray-100 text-gray-700',
}

export function getPostTypeColourClass(key, colourMap = {}) {
  const colour = colourMap[key] || 'gray'
  return COLOUR_CLASSES[colour] || COLOUR_CLASSES.gray
}
