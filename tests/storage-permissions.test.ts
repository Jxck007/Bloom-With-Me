import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearCompletedFlowers,
  loadCompletedFlowers,
  PROGRESS_STORAGE_KEY,
  saveCompletedFlowers,
  type ProgressStorage,
} from '../src/game/progressStorage.ts'
import { permissionFailure } from '../src/media/permissionState.ts'

class MemoryStorage implements ProgressStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

test('progress saves and restores completed flowers', () => {
  const storage = new MemoryStorage()
  saveCompletedFlowers(['rose', 'sunflower'], storage)
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), '["rose","sunflower"]')
  assert.deepEqual(loadCompletedFlowers(storage), ['rose', 'sunflower'])
})

test('invalid stored data is ignored safely', () => {
  const storage = new MemoryStorage()
  storage.setItem(PROGRESS_STORAGE_KEY, '{broken')
  assert.deepEqual(loadCompletedFlowers(storage), [])
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(['rose', 'weed', 12, 'rose']))
  assert.deepEqual(loadCompletedFlowers(storage), ['rose'])
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ completed: ['rose'] }))
  assert.deepEqual(loadCompletedFlowers(storage), [])
})

test('reset removes completion data', () => {
  const storage = new MemoryStorage()
  saveCompletedFlowers(['lavender'], storage)
  clearCompletedFlowers(storage)
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null)
  saveCompletedFlowers([], storage)
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null)
})

test('camera and microphone permission denial is classified consistently', () => {
  assert.equal(permissionFailure(new DOMException('no camera', 'NotAllowedError')), 'denied')
  assert.equal(permissionFailure(new DOMException('no microphone', 'SecurityError')), 'denied')
  assert.equal(permissionFailure(new DOMException('missing device', 'NotFoundError')), 'unavailable')
})
