import type { FlowerId } from '../data/flowers'

export type SeedInteractionPhase =
  | 'idle'
  | 'hovering-packet'
  | 'pinch-started'
  | 'seed-grabbed'
  | 'dragging'
  | 'pinch-released'
  | 'planted'
  | 'returned'

export interface SeedInteractionDebug {
  phase: SeedInteractionPhase
  hoveredPacket: FlowerId | null
  grabbedSeed: FlowerId | null
  dropZoneOverlap: boolean
}
