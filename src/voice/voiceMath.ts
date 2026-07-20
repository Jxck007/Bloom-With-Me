export const ENGLISH_GROWTH_TERMS = ['grow', 'go', 'bloom', 'flower'] as const
export const TAMIL_GROWTH_TERMS = ['வளர்', 'வளரு', 'மலர்', 'பூ'] as const
export const GROWTH_TERMS = [...ENGLISH_GROWTH_TERMS, ...TAMIL_GROWTH_TERMS] as const

export const VOICE_CALIBRATION_MS = 900
export const VOICE_SUSTAIN_MS = 900
export const VOICE_COOLDOWN_MS = 1600
export const VOICE_SILENCE_GRACE_MS = 600
export const VOICE_PROGRESS_DECAY_MS = 1400

export function speechRecognitionSupported(scope: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }): boolean {
  return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition)
}

export function normalizeTranscript(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      current[rightIndex] = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution)
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

function tokenMatchesEnglish(token: string, term: typeof ENGLISH_GROWTH_TERMS[number]): boolean {
  if (token === term) return true
  if (term.length <= 2) return false
  if ([`${term}s`, `${term}ed`, `${term}ing`].includes(token)) return true
  return Math.abs(token.length - term.length) <= 1 && editDistance(token, term) <= 1
}

export function matchesGrowthPhrase(value: string): boolean {
  const normalized = normalizeTranscript(value)
  if (!normalized) return false
  const tokens = normalized.split(' ')
  return tokens.some((token) => {
    if (ENGLISH_GROWTH_TERMS.some((term) => tokenMatchesEnglish(token, term))) return true
    return TAMIL_GROWTH_TERMS.some((term) => token === term || (term.length > 2 && token.startsWith(term) && token.length <= term.length + 2))
  })
}

export interface VocalGateState {
  calibrationStartedAt: number
  calibrationSamples: number[]
  calibrated: boolean
  baseline: number
  threshold: number
  loudSince: number | null
  lastUpdatedAt: number
  smoothedRms: number
  progress: number
  triggered: boolean
}

export const initialVocalGateState = (now: number): VocalGateState => ({
  calibrationStartedAt: now,
  calibrationSamples: [],
  calibrated: false,
  baseline: 0.008,
  threshold: 0.025,
  loudSince: null,
  lastUpdatedAt: now,
  smoothedRms: 0,
  progress: 0,
  triggered: false,
})

function median(values: number[]): number {
  if (!values.length) return 0.008
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function thresholdFor(baseline: number): number {
  return Math.max(0.02, baseline * 1.8 + 0.006)
}

export function advanceVocalGate(current: VocalGateState, rms: number, now: number): VocalGateState {
  if (current.triggered) return current

  if (!current.calibrated) {
    const calibrationSamples = [...current.calibrationSamples, rms].slice(-90)
    if (now - current.calibrationStartedAt < VOICE_CALIBRATION_MS) {
      return { ...current, calibrationSamples }
    }
    const baseline = Math.max(0.002, median(calibrationSamples))
    return {
      ...current,
      calibrationSamples,
      calibrated: true,
      baseline,
      threshold: thresholdFor(baseline),
      lastUpdatedAt: now,
      smoothedRms: baseline,
    }
  }

  const elapsed = Math.max(0, now - current.lastUpdatedAt)
  const smoothing = 1 - Math.exp(-elapsed / 120)
  const smoothedRms = current.smoothedRms + (rms - current.smoothedRms) * Math.max(0.08, Math.min(0.55, smoothing))
  const clearlyLoud = smoothedRms >= current.threshold
  if (!clearlyLoud) {
    const baseline = current.baseline * 0.985 + smoothedRms * 0.015
    const silentFor = current.loudSince === null ? Number.POSITIVE_INFINITY : now - current.loudSince
    const progress = silentFor > VOICE_SILENCE_GRACE_MS
      ? Math.max(0, current.progress - elapsed / VOICE_PROGRESS_DECAY_MS)
      : current.progress
    return {
      ...current,
      baseline,
      threshold: thresholdFor(baseline),
      loudSince: progress > 0 ? current.loudSince : null,
      lastUpdatedAt: now,
      smoothedRms,
      progress,
    }
  }

  const loudSince = current.loudSince ?? now
  const progress = Math.min(1, current.progress + elapsed / VOICE_SUSTAIN_MS)
  return {
    ...current,
    loudSince,
    lastUpdatedAt: now,
    smoothedRms,
    progress,
    triggered: progress >= 1,
  }
}
