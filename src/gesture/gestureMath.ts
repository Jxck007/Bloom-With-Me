export type GestureName = 'pinch' | 'open-palm' | 'wave'

export interface Point3D { x: number; y: number; z?: number }
export interface WristSample { x: number; time: number }

export function distance(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function palmSize(l: Point3D[]): number {
  if (l.length < 18) return 0.1
  return Math.max(0.04, (distance(l[0], l[9]) + distance(l[5], l[17])) / 2)
}

function fingerExtended(l: Point3D[], tip: number, pip: number, mcp: number): boolean {
  const wrist = l[0]
  return distance(wrist, l[tip]) > distance(wrist, l[pip]) * 1.12 &&
    distance(l[tip], l[mcp]) > distance(l[pip], l[mcp]) * 1.25
}

export function pinchScore(l: Point3D[]): number {
  if (l.length < 21) return 0
  const ratio = distance(l[4], l[8]) / palmSize(l)
  return Math.max(0, Math.min(1, 1 - ratio / 0.72))
}

export function isPinching(l: Point3D[]): boolean {
  return pinchScore(l) > 0.56
}

export function openPalmScore(l: Point3D[]): number {
  if (l.length < 21) return 0
  const extended = [
    fingerExtended(l, 8, 6, 5),
    fingerExtended(l, 12, 10, 9),
    fingerExtended(l, 16, 14, 13),
    fingerExtended(l, 20, 18, 17),
  ].filter(Boolean).length
  const spread = (distance(l[8], l[20]) / palmSize(l))
  return Math.min(1, extended / 4 * 0.8 + Math.min(1, spread / 2.2) * 0.2)
}

export function isOpenPalm(l: Point3D[]): boolean {
  return openPalmScore(l) > 0.78 && !isPinching(l)
}

export function waveScore(samples: WristSample[]): number {
  if (samples.length < 8) return 0
  const xs = samples.map(s => s.x)
  const range = Math.max(...xs) - Math.min(...xs)
  let reversals = 0
  let previousDirection = 0
  for (let i = 1; i < xs.length; i += 1) {
    const delta = xs[i] - xs[i - 1]
    if (Math.abs(delta) < 0.009) continue
    const direction = Math.sign(delta)
    if (previousDirection && direction !== previousDirection) reversals += 1
    previousDirection = direction
  }
  return Math.min(1, (range / 0.18) * 0.65 + (reversals / 3) * 0.35)
}

export function isWaving(samples: WristSample[]): boolean {
  return waveScore(samples) > 0.78
}
