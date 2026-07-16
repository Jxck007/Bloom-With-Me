import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completeGameStep,
  plantSelectedSeed,
  resetGameProgress,
  saveCompletedFlower,
  selectSeed,
} from '../src/game/gameState.ts'

test('game state completes one flower and begins the next seed', () => {
  const selected = selectSeed('rose')
  assert.deepEqual(selected, { selected: 'rose', step: 'plant' })

  const planted = plantSelectedSeed(selected)
  assert.equal(planted.step, 'sun')
  assert.equal(completeGameStep(planted.step), 'rain')
  assert.equal(completeGameStep('rain'), 'grow')
  assert.equal(completeGameStep('grow'), 'reveal')

  const saved = saveCompletedFlower([], 'rose')
  assert.deepEqual(saved.completed, ['rose'])
  assert.equal(saved.step, 'choose')
  assert.equal(saved.selected, null)

  const nextSeed = selectSeed('sunflower')
  assert.equal(nextSeed.selected, 'sunflower')
  assert.equal(nextSeed.step, 'plant')
})

test('saving all three flowers completes the garden without duplicates', () => {
  const final = saveCompletedFlower(['rose', 'sunflower'], 'lavender')
  assert.deepEqual(final.completed, ['rose', 'sunflower', 'lavender'])
  assert.equal(final.step, 'final')

  const duplicate = saveCompletedFlower(final.completed, 'lavender')
  assert.deepEqual(duplicate.completed, final.completed)
  assert.equal(duplicate.step, 'final')
})

test('reset clears selection, completion data, and returns to seed choice', () => {
  assert.deepEqual(resetGameProgress(), { completed: [], selected: null, step: 'choose' })
})

test('touch continuation uses the same sunlight, rain, and grow transitions', () => {
  assert.equal(completeGameStep('sun'), 'rain')
  assert.equal(completeGameStep('rain'), 'grow')
  assert.equal(completeGameStep('grow'), 'reveal')
})
