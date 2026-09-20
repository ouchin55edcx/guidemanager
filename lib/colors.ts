// Shared group color palette. 15 high-contrast colors that read well on the
// dark map; groups beyond 15 fall back to programmatic golden-angle HSL hues
// so colors never repeat or clash, no matter how many groups are active.
export const GROUP_COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb7185', '#22d3ee', '#fb923c', '#e879f9', '#34d399', '#60a5fa', '#f87171', '#a3e635', '#2dd4bf', '#c084fc']

export function groupColor(number: number, overrides: Record<number, string> = {}) {
  const safe = Math.max(1, number)
  if (overrides[safe]) return overrides[safe]
  if (safe <= GROUP_COLORS.length) return GROUP_COLORS[safe - 1]
  return `hsl(${(safe * 137.508) % 360} 80% 62%)`
}

export function groupTint(number: number, overrides: Record<number, string> = {}) {
  const color = groupColor(number, overrides)
  return color.startsWith('#') ? `${color}33` : color.replace(/\)$/, ' / 20%)')
}