export type GestureName = 'pinch' | 'open-palm' | 'wave' | 'fist' | 'closeOpenGrow'

export interface Point3D { x: number; y: number; z?: number }
export interface WristSample { x: number; time: number }

export const PINCH_START_RATIO = 0.38
export const PINCH_RELEASE_RATIO = 0.5
export const PINCH_STABLE_FRAMES = 3
export const PINCH_LOST_FRAME_TOLERANCE = 2
export const PALM_STABLE_FRAMES = 6
export const WAVE_STABLE_FRAMES = 3
export const GESTURE_COOLDOWN_MS = 1250
export const GROW_POSE_STABLE_MS = 440
export const GROW_SEQUENCE_TIMEOUT_MS = 4000
export const GROW_GESTURE_COOLDOWN_MS = 1600
export const GROW_LOST_FRAME_TOLERANCE = 2

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

function averagePoint(points: Point3D[]): Point3D {
  const count = Math.max(1, points.length)
  return points.reduce((total, point) => ({
    x: total.x + point.x / count,
    y: total.y + point.y / count,
    z: (total.z ?? 0) + (point.z ?? 0) / count,
  }), { x: 0, y: 0, z: 0 })
}

export function fistScore(l: Point3D[]): number {
  if (l.length < 21) return 0
  const size = palmSize(l)
  const palmCenter = averagePoint([l[0], l[5], l[9], l[13], l[17]])
  const fingers = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ] as const
  const curled = fingers.filter(([tip, pip, mcp]) =>
    distance(l[tip], l[mcp]) / size < 1.18
    && distance(l[tip], palmCenter) / size < 1.5
    && distance(l[tip], l[mcp]) < distance(l[pip], l[mcp]) * 1.5
  ).length
  const meanPalmDistance = fingers
    .reduce((sum, [tip]) => sum + distance(l[tip], palmCenter) / size, 0) / fingers.length
  const meanSpread = (
    distance(l[8], l[12])
    + distance(l[12], l[16])
    + distance(l[16], l[20])
  ) / (size * 3)
  const thumbFold = Math.min(
    distance(l[4], l[8]),
    distance(l[4], l[5]),
    distance(l[4], l[9]),
  ) / size

  const nearScore = Math.max(0, Math.min(1, (1.65 - meanPalmDistance) / 0.85))
  const spreadScore = Math.max(0, Math.min(1, (0.82 - meanSpread) / 0.5))
  const thumbScore = Math.max(0, Math.min(1, (1.15 - thumbFold) / 0.75))
  return Math.min(1, curled / 4 * 0.56 + nearScore * 0.2 + spreadScore * 0.14 + thumbScore * 0.1)
}

export function isFist(l: Point3D[]): boolean {
  return fistScore(l) >= 0.74
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

export type GrowGesturePhase =
  | 'waitingForFist'
  | 'fistStable'
  | 'waitingForOpen'
  | 'openStable'
  | 'stageAdvanced'
  | 'cooldown'

export type GrowPoseObservation = 'none' | 'other' | 'fist' | 'open'

export interface GrowGestureTracker {
  phase: GrowGesturePhase
  sequenceStartedAt: number | null
  candidate: 'fist' | 'open' | null
  candidateSince: number | null
  lostFrames: number
  cooldownUntil: number
}

export interface GrowGestureUpdate {
  tracker: GrowGestureTracker
  confirmed: boolean
}

export function initialGrowGestureTracker(): GrowGestureTracker {
  return {
    phase: 'waitingForFist',
    sequenceStartedAt: null,
    candidate: null,
    candidateSince: null,
    lostFrames: 0,
    cooldownUntil: 0,
  }
}

function withCandidate(
  tracker: GrowGestureTracker,
  candidate: 'fist' | 'open',
  now: number,
): GrowGestureTracker {
  return {
    ...tracker,
    candidate,
    candidateSince: tracker.candidate === candidate ? tracker.candidateSince ?? now : now,
    lostFrames: 0,
  }
}

export function updateCloseOpenGrow(
  current: GrowGestureTracker,
  observation: GrowPoseObservation,
  now: number,
): GrowGestureUpdate {
  if (current.phase === 'cooldown') {
    return now >= current.cooldownUntil
      ? { tracker: initialGrowGestureTracker(), confirmed: false }
      : { tracker: current, confirmed: false }
  }
  if (current.phase === 'openStable') {
    return {
      tracker: {
        ...current,
        phase: 'stageAdvanced',
      },
      confirmed: false,
    }
  }
  if (current.phase === 'stageAdvanced') {
    return {
      tracker: {
        ...current,
        phase: 'cooldown',
        cooldownUntil: now + GROW_GESTURE_COOLDOWN_MS,
      },
      confirmed: false,
    }
  }

  if (observation === 'none') {
    const lostFrames = current.lostFrames + 1
    if (lostFrames <= GROW_LOST_FRAME_TOLERANCE) {
      return { tracker: { ...current, lostFrames }, confirmed: false }
    }
    return { tracker: initialGrowGestureTracker(), confirmed: false }
  }

  const timedOut = current.sequenceStartedAt !== null
    && now - current.sequenceStartedAt > GROW_SEQUENCE_TIMEOUT_MS
  if (timedOut) {
    return {
      tracker: {
        ...initialGrowGestureTracker(),
        sequenceStartedAt: now,
        candidate: observation === 'fist' ? 'fist' : null,
        candidateSince: observation === 'fist' ? now : null,
      },
      confirmed: false,
    }
  }

  if (current.phase === 'waitingForFist') {
    if (observation !== 'fist') {
      return {
        tracker: { ...current, sequenceStartedAt: current.sequenceStartedAt ?? now, candidate: null, candidateSince: null, lostFrames: 0 },
        confirmed: false,
      }
    }
    const tracker = withCandidate({ ...current, sequenceStartedAt: current.sequenceStartedAt ?? now }, 'fist', now)
    if (now - (tracker.candidateSince ?? now) < GROW_POSE_STABLE_MS) {
      return { tracker, confirmed: false }
    }
    return {
      tracker: {
        ...tracker,
        phase: 'fistStable',
        candidate: null,
        candidateSince: null,
      },
      confirmed: false,
    }
  }

  if (current.phase === 'fistStable') {
    return {
      tracker: {
        ...current,
        phase: 'waitingForOpen',
        candidate: observation === 'open' ? 'open' : null,
        candidateSince: observation === 'open' ? now : null,
        lostFrames: 0,
      },
      confirmed: false,
    }
  }

  if (current.phase === 'waitingForOpen') {
    if (observation !== 'open') {
      return {
        tracker: { ...current, candidate: null, candidateSince: null, lostFrames: 0 },
        confirmed: false,
      }
    }
    const tracker = withCandidate(current, 'open', now)
    if (now - (tracker.candidateSince ?? now) < GROW_POSE_STABLE_MS) {
      return { tracker, confirmed: false }
    }
    return {
      tracker: {
        ...tracker,
        phase: 'openStable',
        candidate: null,
        candidateSince: null,
      },
      confirmed: true,
    }
  }

  return { tracker: current, confirmed: false }
}
