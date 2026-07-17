import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceStablePinch,
  gestureCooldownReady,
  GROW_GESTURE_COOLDOWN_MS,
  GROW_LOST_FRAME_TOLERANCE,
  GROW_POSE_STABLE_MS,
  initialStablePinchTracker,
  initialGrowGestureTracker,
  nextGestureCooldown,
  PALM_STABLE_FRAMES,
  PINCH_LOST_FRAME_TOLERANCE,
  PINCH_RELEASE_RATIO,
  PINCH_START_RATIO,
  updateGestureStability,
  updateCloseOpenGrow,
  waveDirectionChanges,
} from '../src/gesture/gestureMath.ts'
import { findGardenSlotIncludingOccupied, findMagneticGardenSlot, GARDEN_SLOTS } from '../src/game/gardenSlots.ts'
import { isInsidePotDropZone, resolveSeedDrop } from '../src/gesture/seedInteractionMath.ts'

function runPinch(ratios: Array<number | null>) {
  let tracker = initialStablePinchTracker()
  return ratios.map((ratio) => {
    const result = advanceStablePinch(tracker, ratio)
    tracker = result.tracker
    return result
  })
}

test('pinch starts only after the stable start threshold', () => {
  const results = runPinch([PINCH_START_RATIO, PINCH_START_RATIO, PINCH_START_RATIO])
  assert.equal(results[1].tracker.state, 'open')
  assert.equal(results[2].transition, 'start')
  assert.equal(results[2].tracker.state, 'pinching')
})

test('pinch release uses hysteresis above the start threshold', () => {
  const middle = (PINCH_START_RATIO + PINCH_RELEASE_RATIO) / 2
  const results = runPinch([
    PINCH_START_RATIO, PINCH_START_RATIO, PINCH_START_RATIO,
    middle, middle, middle,
    PINCH_RELEASE_RATIO, PINCH_RELEASE_RATIO, PINCH_RELEASE_RATIO,
  ])
  assert.equal(results[5].tracker.state, 'pinching')
  assert.equal(results.at(-1)?.transition, 'release')
})

test('short landmark loss does not release a grabbed seed', () => {
  const results = runPinch([
    PINCH_START_RATIO, PINCH_START_RATIO, PINCH_START_RATIO,
    ...Array(PINCH_LOST_FRAME_TOLERANCE).fill(null),
  ])
  assert.equal(results.at(-1)?.tracker.state, 'pinching')
  assert.equal(results.at(-1)?.transition, null)

  const released = advanceStablePinch(results.at(-1)!.tracker, null)
  assert.equal(released.transition, 'release')
  assert.equal(released.reason, 'lost')
})

test('drop-zone overlap accepts generous near misses and rejects outside release', () => {
  const pot = { left: 100, right: 200, top: 200, bottom: 320, width: 100, height: 120 }
  assert.equal(isInsidePotDropZone(pot, 60, 150), true)
  assert.equal(resolveSeedDrop(true), 'planted')
  assert.equal(isInsidePotDropZone(pot, 10, 80), false)
  assert.equal(resolveSeedDrop(false), 'returned')
  assert.equal(resolveSeedDrop(true, true), 'returned')
})

test('open palm requires the full stable observation duration', () => {
  let stability = { 'open-palm': 0, wave: 0 }
  for (let frame = 1; frame < PALM_STABLE_FRAMES; frame += 1) {
    stability = updateGestureStability(stability, 'open-palm')
    assert.ok(stability['open-palm'] < PALM_STABLE_FRAMES)
  }
  stability = updateGestureStability(stability, 'open-palm')
  assert.equal(stability['open-palm'], PALM_STABLE_FRAMES)
})

test('wave direction changes count only meaningful reversals', () => {
  const samples = [0.5, 0.55, 0.6, 0.55, 0.5, 0.55, 0.6, 0.55]
    .map((x, index) => ({ x, time: index * 40 }))
  assert.equal(waveDirectionChanges(samples), 3)
  assert.equal(waveDirectionChanges(samples.map((sample, index) => ({ ...sample, x: 0.5 + index * 0.002 }))), 0)
})

test('weather gesture cooldown blocks repeats until its deadline', () => {
  const cooldownUntil = nextGestureCooldown(1000)
  assert.equal(gestureCooldownReady(cooldownUntil - 1, cooldownUntil), false)
  assert.equal(gestureCooldownReady(cooldownUntil, cooldownUntil), true)
})

test('close-open grow requires stable fist before stable open palm', () => {
  let tracker = initialGrowGestureTracker()
  let update = updateCloseOpenGrow(tracker, 'open', 0)
  tracker = update.tracker
  update = updateCloseOpenGrow(tracker, 'open', GROW_POSE_STABLE_MS + 20)
  assert.equal(update.confirmed, false)
  assert.equal(update.tracker.phase, 'waitingForFist')

  tracker = updateCloseOpenGrow(update.tracker, 'fist', 600).tracker
  tracker = updateCloseOpenGrow(tracker, 'fist', 600 + GROW_POSE_STABLE_MS).tracker
  assert.equal(tracker.phase, 'fistHeld')
  tracker = updateCloseOpenGrow(tracker, 'open', 1100).tracker
  update = updateCloseOpenGrow(tracker, 'open', 1100 + GROW_POSE_STABLE_MS)
  assert.equal(update.confirmed, true)
  assert.equal(update.tracker.phase, 'growConfirmed')
})

test('close-open grow tolerates two lost frames and applies cooldown', () => {
  let tracker = updateCloseOpenGrow(initialGrowGestureTracker(), 'fist', 0).tracker
  tracker = updateCloseOpenGrow(tracker, 'fist', GROW_POSE_STABLE_MS).tracker
  tracker = updateCloseOpenGrow(tracker, 'open', 500).tracker
  for (let frame = 0; frame < GROW_LOST_FRAME_TOLERANCE; frame += 1) {
    tracker = updateCloseOpenGrow(tracker, 'none', 520 + frame * 16).tracker
  }
  const confirmed = updateCloseOpenGrow(tracker, 'open', 500 + GROW_POSE_STABLE_MS)
  assert.equal(confirmed.confirmed, true)
  const cooldown = updateCloseOpenGrow(confirmed.tracker, 'open', 1000).tracker
  assert.equal(cooldown.phase, 'cooldown')
  assert.equal(updateCloseOpenGrow(cooldown, 'open', 1000 + GROW_GESTURE_COOLDOWN_MS - 1).confirmed, false)
})

test('magnetic garden drop accepts near misses and skips occupied slots', () => {
  const target = GARDEN_SLOTS[4]
  const nearMiss = findMagneticGardenSlot(
    target.xPercent - 7.2 * 1.4,
    target.yPercent,
    new Set<number>(),
  )
  assert.equal(nearMiss?.slotIndex, target.slotIndex)
  assert.equal(findMagneticGardenSlot(target.xPercent, target.yPercent, new Set([target.slotIndex])), null)
  assert.equal(findGardenSlotIncludingOccupied(target.xPercent, target.yPercent)?.slotIndex, target.slotIndex)
})
