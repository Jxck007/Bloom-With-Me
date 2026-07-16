import type { FlowerId } from '../data/flowers'

export type GameStep = 'welcome' | 'choose' | 'plant' | 'sun' | 'rain' | 'grow' | 'reveal' | 'final'

export interface SeedSelectionState {
  selected: FlowerId | null
  step: GameStep
}

export interface SavedFlowerState extends SeedSelectionState {
  completed: FlowerId[]
}

export function selectSeed(flowerId: FlowerId): SeedSelectionState {
  return { selected: flowerId, step: 'plant' }
}

export function plantSelectedSeed(selection: SeedSelectionState): SeedSelectionState {
  return selection.selected ? { ...selection, step: 'sun' } : selection
}

export function completeGameStep(step: GameStep): GameStep {
  if (step === 'plant') return 'sun'
  if (step === 'sun') return 'rain'
  if (step === 'rain') return 'grow'
  if (step === 'grow') return 'reveal'
  return step
}

export function saveCompletedFlower(completed: FlowerId[], flowerId: FlowerId, flowerCount = 3): SavedFlowerState {
  const nextCompleted = completed.includes(flowerId) ? [...completed] : [...completed, flowerId]
  return {
    completed: nextCompleted,
    selected: null,
    step: nextCompleted.length >= flowerCount ? 'final' : 'choose',
  }
}

export function resetGameProgress(): SavedFlowerState {
  return { completed: [], selected: null, step: 'choose' }
}
