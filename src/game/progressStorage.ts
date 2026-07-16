import type { FlowerId } from '../data/flowers'

export const PROGRESS_STORAGE_KEY = 'bloom-with-me-progress'
const FLOWER_IDS = new Set<FlowerId>(['rose', 'sunflower', 'lavender'])

export interface ProgressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isFlowerId(value: unknown): value is FlowerId {
  return typeof value === 'string' && FLOWER_IDS.has(value as FlowerId)
}

export function loadCompletedFlowers(storage: ProgressStorage = localStorage): FlowerId[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter(isFlowerId))]
  } catch {
    return []
  }
}

export function saveCompletedFlowers(completed: FlowerId[], storage: ProgressStorage = localStorage): void {
  if (!completed.length) {
    storage.removeItem(PROGRESS_STORAGE_KEY)
    return
  }
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([...new Set(completed.filter(isFlowerId))]))
}

export function clearCompletedFlowers(storage: ProgressStorage = localStorage): void {
  storage.removeItem(PROGRESS_STORAGE_KEY)
}
