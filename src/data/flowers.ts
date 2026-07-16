export type FlowerId = 'rose' | 'sunflower' | 'lavender'

export interface FlowerChoice {
  id: FlowerId
  name: string
  seedLabel: string
  petalColor: string
  petalAlt: string
  centerColor: string
  seedClass: string
}

export const FLOWERS: FlowerChoice[] = [
  {
    id: 'rose',
    name: 'Rose',
    seedLabel: 'Blush seed',
    petalColor: '#dfa7ae',
    petalAlt: '#f2c7cb',
    centerColor: '#b97984',
    seedClass: 'seed--rose',
  },
  {
    id: 'sunflower',
    name: 'Sunflower',
    seedLabel: 'Sun seed',
    petalColor: '#f4d58a',
    petalAlt: '#f8e4ae',
    centerColor: '#9b7354',
    seedClass: 'seed--sunflower',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    seedLabel: 'Lavender seed',
    petalColor: '#cdb8df',
    petalAlt: '#e0d1ec',
    centerColor: '#8e78a5',
    seedClass: 'seed--lavender',
  },
]
