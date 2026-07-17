import type { FlowerId } from './flowers'

export interface FlowerGrowthLayout {
  width: string
  maxHeight: string
  soilCrop: string
}

export const FLOWER_GROWTH_LAYOUT: Record<FlowerId, FlowerGrowthLayout> = {
  rose: { width: '90%', maxHeight: '280px', soilCrop: '7%' },
  sunflower: { width: '82%', maxHeight: '320px', soilCrop: '6%' },
  lavender: { width: '72%', maxHeight: '320px', soilCrop: '6%' },
}

export const GARDEN_FLOWER_TYPE_SCALE: Record<FlowerId, number> = {
  rose: 0.84,
  sunflower: 0.94,
  lavender: 0.7,
}
