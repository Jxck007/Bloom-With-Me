export type GestureName = 'pinch' | 'open-palm' | 'wave'

export interface Point3D { x: number; y: number; z?: number }
export interface WristSample { x: number; time: number }

export const PINCH_START_RATIO = 0.38
export const PINCH_RELEASE_RATIO = 0.5
export const PINCH_STABLE_FRAMES = 3
export const PINCH_LOST_FRAME_TOLERANCE = 2
export const PALM_STABLE_FRAMES = 6
export const WAVE_STABLE_FRAMES = 3
export const GESTURE_COOLDOWN_MS = 1250
export type WeatherGesture = 'open-palm' | 'wave'
export type GestureStability = Record<WeatherGesture, number>

export function updateGestureStability(current: GestureStability, selected: WeatherGesture | undefined): GestureStability {
  return {
    'open-palm': selected === 'open-palm' ? current['open-palm'] + 1 : Math.max(0, current['open-palm'] - 1),
    wave: selected === 'wave' ? current.wave + 1 : Math.max(0, current.wave - 1),
  }
}

export function gestureCooldownReady(now: number, cooldownUntil: number): boolean {
  return now >= cooldownUntil
}

export function nextGestureCooldown(now: number): number {
  return now + GESTURE_COOLDOWN_MS
}

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
  const size = palmSize(l)
  const spread = distance(l[8], l[20]) / size
  const thumbSeparation = Math.min(1, distance(l[4], l[5]) / size / 0.9)
  const palmFacing = Math.min(1, distance(l[5], l[17]) / size / 1.05)
  return Math.min(
    1,
    extended / 4 * 0.66
      + Math.min(1, spread / 2.2) * 0.16
      + thumbSeparation * 0.1
      + palmFacing * 0.08,
  )
}

export function isOpenPalm(l: Point3D[]): boolean {
  return openPalmScore(l) > 0.78 && !isPinching(l)
}

export function waveScore(samples: WristSample[]): number {
  if (samples.length < 8) return 0
  const xs = samples.map(s => s.x)
  const range = Math.max(...xs) - Math.min(...xs)
  const reversals = waveDirectionChanges(samples)
  return Math.min(1, (range / 0.18) * 0.65 + (reversals / 3) * 0.35)
}

export function waveDirectionChanges(samples: WristSample[]): number {
  const xs = samples.map(s => s.x)
  let reversals = 0
  let previousDirection = 0
  for (let i = 1; i < xs.length; i += 1) {
    const delta = xs[i] - xs[i - 1]
    if (Math.abs(delta) < 0.009) continue
    const direction = Math.sign(delta)
    if (previousDirection && direction !== previousDirection) reversals += 1
    previousDirection = direction
  }
  return reversals
}

export function isWaving(samples: WristSample[]): boolean {
  return waveScore(samples) > 0.78
}
