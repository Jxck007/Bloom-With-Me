import type { FlowerId } from './flowers'

export interface FlowerGrowthLayout {
  width: string
  maxHeight: string
  soilCrop: string
}

export const FLOWER_GROWTH_LAYOUT: Record<FlowerId, FlowerGrowthLayout> = {
  rose: { width: '86%', maxHeight: '284px', soilCrop: '22%' },
  sunflower: { width: '78%', maxHeight: '330px', soilCrop: '20%' },
  lavender: { width: '68%', maxHeight: '320px', soilCrop: '24%' },
}

export const GARDEN_FLOWER_TYPE_SCALE: Record<FlowerId, number> = {
  rose: 0.84,
  sunflower: 0.94,
  lavender: 0.7,
}
