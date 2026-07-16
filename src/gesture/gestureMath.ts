export type GestureName = 'pinch' | 'open-palm' | 'wave'

export interface Point3D { x: number; y: number; z?: number }
export interface WristSample { x: number; time: number }

export const PINCH_START_RATIO = 0.38
export const PINCH_RELEASE_RATIO = 0.5
export const PINCH_STABLE_FRAMES = 3
export const PINCH_LOST_FRAME_TOLERANCE = 2

export interface StablePinchTracker {
  state: 'open' | 'pinching'
  startFrames: number
  releaseFrames: number
  lostFrames: number
}

export interface StablePinchUpdate {
  tracker: StablePinchTracker
  transition: 'start' | 'release' | null
  reason: 'gesture' | 'lost' | null
}

export const initialStablePinchTracker = (): StablePinchTracker => ({
  state: 'open',
  startFrames: 0,
  releaseFrames: 0,
  lostFrames: 0,
})

export function advanceStablePinch(current: StablePinchTracker, ratio: number | null): StablePinchUpdate {
  if (ratio === null) {
    const lostFrames = current.state === 'pinching' ? current.lostFrames + 1 : 0
    if (current.state === 'pinching' && lostFrames > PINCH_LOST_FRAME_TOLERANCE) {
      return { tracker: initialStablePinchTracker(), transition: 'release', reason: 'lost' }
    }
    return {
      tracker: { ...current, startFrames: 0, releaseFrames: 0, lostFrames },
      transition: null,
      reason: null,
    }
  }

  if (current.state === 'open') {
    const startFrames = ratio <= PINCH_START_RATIO ? current.startFrames + 1 : 0
    if (startFrames >= PINCH_STABLE_FRAMES) {
      return {
        tracker: { state: 'pinching', startFrames: 0, releaseFrames: 0, lostFrames: 0 },
        transition: 'start',
        reason: 'gesture',
      }
    }
    return {
      tracker: { state: 'open', startFrames, releaseFrames: 0, lostFrames: 0 },
      transition: null,
      reason: null,
    }
  }

  const releaseFrames = ratio >= PINCH_RELEASE_RATIO ? current.releaseFrames + 1 : 0
  if (releaseFrames >= PINCH_STABLE_FRAMES) {
    return { tracker: initialStablePinchTracker(), transition: 'release', reason: 'gesture' }
  }
  return {
    tracker: { state: 'pinching', startFrames: 0, releaseFrames, lostFrames: 0 },
    transition: null,
    reason: null,
  }
}

export function distance(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function palmSize(l: Point3D[]): number {
  if (l.length < 18) return 0.1
  return Math.max(0.04, (distance(l[0], l[9]) + distance(l[5], l[17])) / 2)
}

export function pinchRatio(l: Point3D[]): number {
  if (l.length < 21) return Number.POSITIVE_INFINITY
  return distance(l[4], l[8]) / palmSize(l)
}

function fingerExtended(l: Point3D[], tip: number, pip: number, mcp: number): boolean {
  const wrist = l[0]
  return distance(wrist, l[tip]) > distance(wrist, l[pip]) * 1.12 &&
    distance(l[tip], l[mcp]) > distance(l[pip], l[mcp]) * 1.25
}

export function pinchScore(l: Point3D[]): number {
  if (l.length < 21) return 0
  const ratio = pinchRatio(l)
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
