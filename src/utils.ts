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

/** wplace's shop, and what a painted pixel pays back into it */
export const DROPLETS_PER_PIXEL = 1
export const DROPLETS_PER_PACK = 500
export const CHARGES_PER_PACK = 30
export const DROPLETS_PER_COLOR = 2000

/** Share of a charge that one painted pixel earns back through the shop (~6.0%) */
const CHARGE_PAYBACK =
  (DROPLETS_PER_PIXEL * CHARGES_PER_PACK) / DROPLETS_PER_PACK

/**
 * Pixels one bought pack is really worth. Painting its 30 charges earns
 * droplets that buy more charges, which earn more droplets, so a 500-droplet
 * pack effectively costs 470 and covers ~31.9 pixels rather than 30
 */
export const CHARGES_PER_PACK_WITH_PAYBACK =
  CHARGES_PER_PACK / (1 - CHARGE_PAYBACK)

/**
 * Time to paint `remaining` pixels.
 *
 * Pass `droplets` to count the shop in: the balance and everything the run
 * earns turn into charges, minus what the `colorsToBuy` missing colors cost,
 * since those are paid for first. Leave it out and only natural regeneration
 * counts.
 */
export function estimateEtaMinutes(
  remaining: number,
  charges: number,
  maxCharges: number,
  cooldownMs: number,
  elapsedMs: number,
  droplets?: number,
  colorsToBuy = 0,
) {
  if (cooldownMs <= 0) return 0
  const regeneratedCharges = Math.max(0, elapsedMs) / cooldownMs
  const availableCharges = Math.min(
    Math.max(0, maxCharges),
    Math.max(0, charges) + regeneratedCharges,
  )
  let needed = Math.max(0, remaining)
  if (droplets !== undefined) {
    const earned = Math.max(0, droplets) + needed * DROPLETS_PER_PIXEL
    const spentOnColors = Math.max(0, colorsToBuy) * DROPLETS_PER_COLOR
    // Packs are bought as the run needs them, so the account maximum does not
    // cap what the shop adds, and whole packs are noise at this scale
    needed -=
      (Math.max(0, earned - spentOnColors) * CHARGES_PER_PACK) /
      DROPLETS_PER_PACK
  }
  return (Math.max(0, needed - availableCharges) * cooldownMs) / 60000
}

export function nextTaskIndex(index: number, painted: boolean) {
  return painted ? index + 1 : index
}

export function confirmedTaskPrefix(results: readonly boolean[]) {
  let index = 0
  while (index < results.length && results[index]) index++
  return index
}
