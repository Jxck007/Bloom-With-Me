import type { FlowerId } from '../data/flowers'

export const GARDEN_STORAGE_KEY = 'bloom-with-me-garden-v1'
export const GARDEN_STORAGE_VERSION = 1 as const
export const GARDEN_SLOTS_PER_PAGE = 12

const FLOWER_IDS = new Set<FlowerId>(['rose', 'sunflower', 'lavender'])

export interface GardenFlower {
  id: string
  flowerType: FlowerId
  slotIndex: number
  plantedAt: number
}

export interface GardenPage {
  id: string
  flowers: GardenFlower[]
}

export interface GardenData {
  version: typeof GARDEN_STORAGE_VERSION
  activePageIndex: number
  pages: GardenPage[]
}

export interface GardenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function makeId(prefix: string): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${randomId}`
}

export function createGardenPage(): GardenPage {
  return { id: makeId('garden'), flowers: [] }
}

export function createEmptyGarden(): GardenData {
  return { version: GARDEN_STORAGE_VERSION, activePageIndex: 0, pages: [createGardenPage()] }
}

function isFlowerId(value: unknown): value is FlowerId {
  return typeof value === 'string' && FLOWER_IDS.has(value as FlowerId)
}

function isGardenFlower(value: unknown): value is GardenFlower {
  if (!value || typeof value !== 'object') return false
  const flower = value as Partial<GardenFlower>
  return typeof flower.id === 'string'
    && flower.id.length > 0
    && isFlowerId(flower.flowerType)
    && Number.isInteger(flower.slotIndex)
    && Number(flower.slotIndex) >= 0
    && Number(flower.slotIndex) < GARDEN_SLOTS_PER_PAGE
    && typeof flower.plantedAt === 'number'
    && Number.isFinite(flower.plantedAt)
    && flower.plantedAt >= 0
}

function isGardenPage(value: unknown): value is GardenPage {
  if (!value || typeof value !== 'object') return false
  const page = value as Partial<GardenPage>
  if (typeof page.id !== 'string' || !page.id || !Array.isArray(page.flowers)) return false
  if (!page.flowers.every(isGardenFlower)) return false
  const slots = new Set(page.flowers.map((flower) => flower.slotIndex))
  const ids = new Set(page.flowers.map((flower) => flower.id))
  return slots.size === page.flowers.length && ids.size === page.flowers.length
}

export function isGardenData(value: unknown): value is GardenData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<GardenData>
  return data.version === GARDEN_STORAGE_VERSION
    && Array.isArray(data.pages)
    && data.pages.length > 0
    && data.pages.every(isGardenPage)
    && Number.isInteger(data.activePageIndex)
    && Number(data.activePageIndex) >= 0
    && Number(data.activePageIndex) < data.pages.length
}

export function loadGardenData(storage: GardenStorage = localStorage): GardenData {
  try {
    const raw = storage.getItem(GARDEN_STORAGE_KEY)
    if (!raw) return createEmptyGarden()
    const parsed: unknown = JSON.parse(raw)
    return isGardenData(parsed) ? parsed : createEmptyGarden()
  } catch {
    return createEmptyGarden()
  }
}

export function saveGardenData(data: GardenData, storage: GardenStorage = localStorage): void {
  if (!isGardenData(data)) return
  storage.setItem(GARDEN_STORAGE_KEY, JSON.stringify(data))
}

export function clearGardenData(storage: GardenStorage = localStorage): void {
  storage.removeItem(GARDEN_STORAGE_KEY)
}

export function gardenFlowerCount(data: GardenData): number {
  return data.pages.reduce((total, page) => total + page.flowers.length, 0)
}

export function setActiveGardenPage(data: GardenData, activePageIndex: number): GardenData {
  if (!Number.isInteger(activePageIndex) || activePageIndex < 0 || activePageIndex >= data.pages.length) return data
  return { ...data, activePageIndex }
}

export function ensureActivePageHasSpace(data: GardenData): GardenData {
  const activePage = data.pages[data.activePageIndex]
  if (activePage.flowers.length < GARDEN_SLOTS_PER_PAGE) return data
  const nextOpenIndex = data.pages.findIndex((page, index) => index > data.activePageIndex && page.flowers.length < GARDEN_SLOTS_PER_PAGE)
  if (nextOpenIndex >= 0) return { ...data, activePageIndex: nextOpenIndex }
  const pages = [...data.pages, createGardenPage()]
  return { ...data, activePageIndex: pages.length - 1, pages }
}

export function plantGardenFlower(
  data: GardenData,
  flowerType: FlowerId,
  slotIndex: number,
  plantedAt = Date.now(),
): GardenData | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= GARDEN_SLOTS_PER_PAGE) return null
  const prepared = ensureActivePageHasSpace(data)
  const page = prepared.pages[prepared.activePageIndex]
  if (page.flowers.some((flower) => flower.slotIndex === slotIndex)) return null

  const planted: GardenFlower = { id: makeId('flower'), flowerType, slotIndex, plantedAt }
  const pages = prepared.pages.map((candidate, index) => index === prepared.activePageIndex
    ? { ...candidate, flowers: [...candidate.flowers, planted] }
    : candidate)
  const plantedData = { ...prepared, pages }
  return pages[prepared.activePageIndex].flowers.length === GARDEN_SLOTS_PER_PAGE
    ? ensureActivePageHasSpace(plantedData)
    : plantedData
}
