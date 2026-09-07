export function formatPercent(n: number) {
  if (Number.isNaN(n)) return '0%'
  if (n < 0.1) n = ((n * 1000) | 0) / 10
  else n = (n * 100) | 0
  return n + '%'
}

export function formatEta(minutes: number) {
  const totalMinutes = Math.max(0, Math.floor(minutes))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const remainingMinutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h ${remainingMinutes}m`
  return `${hours}h ${remainingMinutes}m`
}
