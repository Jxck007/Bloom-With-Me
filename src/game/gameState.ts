import type { FlowerId } from '../data/flowers'

export type GameStep = 'welcome' | 'choose' | 'plant' | 'sun' | 'rain' | 'grow' | 'place'

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
  if (step === 'grow') return 'place'
  return step
}

export function saveCompletedFlower(completed: FlowerId[], flowerId: FlowerId): SavedFlowerState {
  const nextCompleted = [...completed, flowerId]
  return {
    completed: nextCompleted,
    selected: null,
    step: 'choose',
  }
}

export function resetGameProgress(): SavedFlowerState {
  return { completed: [], selected: null, step: 'choose' }
}
