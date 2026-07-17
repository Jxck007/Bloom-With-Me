export const SUN_HOLD_DURATION_MS = 5000
export const SUN_HOLD_MIN_MS = 4000
export const SUN_HOLD_MAX_MS = 6000
export const SUN_HOLD_LOSS_GRACE_MS = 300
export const SUN_HOLD_DECAY_PER_SECOND = 0.2

export interface SunHoldTracker {
  progressMs: number
  lastUpdateAt: number | null
  invalidSince: number | null
  completed: boolean
}

export function initialSunHoldTracker(): SunHoldTracker {
  return {
    progressMs: 0,
    lastUpdateAt: null,
    invalidSince: null,
    completed: false,
  }
}

export function updateSunHold(
  current: SunHoldTracker,
  validOpenPalm: boolean,
  now: number,
  durationMs = SUN_HOLD_DURATION_MS,
): SunHoldTracker {
  if (current.completed) return current
  const safeDuration = Math.min(SUN_HOLD_MAX_MS, Math.max(SUN_HOLD_MIN_MS, durationMs))
  const elapsed = current.lastUpdateAt === null
    ? 0
    : Math.max(0, Math.min(250, now - current.lastUpdateAt))

  if (validOpenPalm) {
    const progressMs = Math.min(safeDuration, current.progressMs + elapsed)
    return {
      progressMs,
      lastUpdateAt: now,
      invalidSince: null,
      completed: progressMs >= safeDuration,
    }
  }

  const invalidSince = current.invalidSince ?? now
  const insideGrace = now - invalidSince < SUN_HOLD_LOSS_GRACE_MS
  const progressMs = insideGrace
    ? current.progressMs
    : Math.max(0, current.progressMs - elapsed * SUN_HOLD_DECAY_PER_SECOND)
  return {
    progressMs,
    lastUpdateAt: now,
    invalidSince,
    completed: false,
  }
}
