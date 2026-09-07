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

export function estimateEtaMinutes(
  remaining: number,
  charges: number,
  maxCharges: number,
  cooldownMs: number,
  elapsedMs: number,
) {
  if (cooldownMs <= 0) return 0
  const regeneratedCharges = Math.max(0, elapsedMs) / cooldownMs
  const availableCharges = Math.min(
    Math.max(0, maxCharges),
    Math.max(0, charges) + regeneratedCharges,
  )
  return (Math.max(0, remaining - availableCharges) * cooldownMs) / 60000
}

export function nextTaskIndex(index: number, painted: boolean) {
  return painted ? index + 1 : index
}

export function confirmedTaskPrefix(results: readonly boolean[]) {
  let index = 0
  while (index < results.length && results[index]) index++
  return index
}
