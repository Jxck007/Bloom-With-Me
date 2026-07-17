import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearGardenData,
  createEmptyGarden,
  GARDEN_STORAGE_KEY,
  loadGardenData,
  plantGardenFlower,
  saveGardenData,
  setActiveGardenPage,
  type GardenStorage,
} from '../src/game/gardenStorage.ts'
import { GARDEN_SLOTS } from '../src/game/gardenSlots.ts'
import { permissionFailure } from '../src/media/permissionState.ts'

class MemoryStorage implements GardenStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

test('garden saves repeated flowers and restores the versioned format', () => {
  const storage = new MemoryStorage()
  const empty = createEmptyGarden()
  const first = plantGardenFlower(empty, 'rose', 0, 100)
  assert.ok(first)
  const second = plantGardenFlower(first, 'rose', 1, 200)
  assert.ok(second)
  saveGardenData(second, storage)

  const restored = loadGardenData(storage)
  assert.equal(restored.version, 1)
  assert.deepEqual(restored.pages[0].flowers.map((flower) => flower.flowerType), ['rose', 'rose'])
  assert.deepEqual(restored.pages[0].flowers.map((flower) => flower.slotIndex), [0, 1])
  assert.equal(JSON.parse(storage.getItem(GARDEN_STORAGE_KEY) ?? '{}').version, 1)
})

test('occupied slots are rejected and a new garden page is created after slot twelve', () => {
  let garden = createEmptyGarden()
  const once = plantGardenFlower(garden, 'rose', 0, 1)
  assert.ok(once)
  assert.equal(plantGardenFlower(once, 'lavender', 0, 2), null)

  for (let slotIndex = 0; slotIndex < 12; slotIndex += 1) {
    const next = plantGardenFlower(garden, slotIndex % 2 ? 'sunflower' : 'rose', slotIndex, slotIndex + 1)
    assert.ok(next)
    garden = next
  }
  assert.equal(garden.pages[0].flowers.length, 12)
  assert.equal(garden.pages.length, 2)
  assert.equal(garden.activePageIndex, 1)
  assert.equal(garden.pages[1].flowers.length, 0)

  const viewingFirst = setActiveGardenPage(garden, 0)
  const plantedOnOpenPage = plantGardenFlower(viewingFirst, 'lavender', 0)
  assert.ok(plantedOnOpenPage)
  assert.equal(plantedOnOpenPage.pages[1].flowers.length, 1)
})

test('invalid stored garden data is ignored safely', () => {
  const storage = new MemoryStorage()
  storage.setItem(GARDEN_STORAGE_KEY, '{broken')
  assert.equal(loadGardenData(storage).pages.length, 1)

  storage.setItem(GARDEN_STORAGE_KEY, JSON.stringify({ version: 1, activePageIndex: 0, pages: [] }))
  assert.equal(loadGardenData(storage).pages.length, 1)

  storage.setItem(GARDEN_STORAGE_KEY, JSON.stringify({
    version: 1,
    activePageIndex: 0,
    pages: [{ id: 'garden-a', flowers: [
      { id: 'a', flowerType: 'rose', slotIndex: 0, plantedAt: 1 },
      { id: 'b', flowerType: 'lavender', slotIndex: 0, plantedAt: 2 },
    ] }],
  }))
  assert.equal(loadGardenData(storage).pages[0].flowers.length, 0)
})

test('garden slots expose collision-free 4 by 3 percentage coordinates', () => {
  assert.equal(GARDEN_SLOTS.length, 12)
  assert.deepEqual([...new Set(GARDEN_SLOTS.map((slot) => slot.column))], [0, 1, 2, 3])
  assert.deepEqual([...new Set(GARDEN_SLOTS.map((slot) => slot.row))], [0, 1, 2])
  assert.equal(new Set(GARDEN_SLOTS.map((slot) => `${slot.xPercent}:${slot.yPercent}`)).size, 12)
  assert.ok(GARDEN_SLOTS.every((slot) => slot.xPercent > 0 && slot.xPercent < 100 && slot.yPercent > 0 && slot.yPercent < 100))
})

test('explicit reset removes garden data', () => {
  const storage = new MemoryStorage()
  saveGardenData(createEmptyGarden(), storage)
  clearGardenData(storage)
  assert.equal(storage.getItem(GARDEN_STORAGE_KEY), null)
})

test('camera and microphone permission denial is classified consistently', () => {
  assert.equal(permissionFailure(new DOMException('no camera', 'NotAllowedError')), 'denied')
  assert.equal(permissionFailure(new DOMException('no microphone', 'SecurityError')), 'denied')
  assert.equal(permissionFailure(new DOMException('missing device', 'NotFoundError')), 'unavailable')
})
