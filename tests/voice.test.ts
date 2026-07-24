import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceVocalGate,
  ENGLISH_GROWTH_TERMS,
  initialVocalGateState,
  matchesGrowthPhrase,
  normalizeTranscript,
  speechRecognitionSupported,
  TAMIL_GROWTH_TERMS,
  VOICE_CALIBRATION_MS,
  VOICE_SILENCE_GRACE_MS,
  VOICE_SUSTAIN_MS,
} from '../src/voice/voiceMath.ts'

function calibratedGate(baseline = 0.008) {
  let gate = initialVocalGateState(0)
  gate = advanceVocalGate(gate, baseline, 0)
  return advanceVocalGate(gate, baseline, VOICE_CALIBRATION_MS)
}

test('transcript normalization lowercases, trims, and removes punctuation', () => {
  assert.equal(normalizeTranscript('  BLOOM!!!  Flower? '), 'bloom flower')
})

test('all English and Tamil growth terms are accepted', () => {
  for (const term of [...ENGLISH_GROWTH_TERMS, ...TAMIL_GROWTH_TERMS]) {
    assert.equal(matchesGrowthPhrase(term), true, term)
  }
})

test('minor transcription differences pass while unrelated words are rejected', () => {
  assert.equal(matchesGrowthPhrase('bloon'), true)
  assert.equal(matchesGrowthPhrase('flowr'), true)
  for (const word of ['cat', 'raincoat', 'window', 'ground']) {
    assert.equal(matchesGrowthPhrase(word), false, word)
  }
})

test('a short sound spike is rejected', () => {
  let gate = calibratedGate()
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 1)
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 120)
  gate = advanceVocalGate(gate, 0.006, VOICE_CALIBRATION_MS + 140)
  assert.equal(gate.triggered, false)
  assert.ok(gate.progress < 0.2)
})

test('a sustained sound above baseline is accepted', () => {
  let gate = calibratedGate()
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 1)
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + VOICE_SUSTAIN_MS + 2)
  assert.equal(gate.triggered, true)
})

test('the vocal gate resets after a successful trigger so it can fire again', () => {
  let gate = calibratedGate()
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 1)
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + VOICE_SUSTAIN_MS + 2)
  assert.equal(gate.triggered, true)

  gate = advanceVocalGate(gate, 0.002, VOICE_CALIBRATION_MS + VOICE_SUSTAIN_MS + 2 + 300)
  assert.equal(gate.triggered, false)
})

test('brief silence preserves voice progress before gradual decay', () => {
  let gate = calibratedGate()
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 1)
  gate = advanceVocalGate(gate, 0.08, VOICE_CALIBRATION_MS + 360)
  const progressBeforeSilence = gate.progress
  gate = advanceVocalGate(gate, 0.002, VOICE_CALIBRATION_MS + 360 + VOICE_SILENCE_GRACE_MS - 80)
  assert.ok(gate.progress >= progressBeforeSilence)
  gate = advanceVocalGate(gate, 0.002, VOICE_CALIBRATION_MS + 360 + VOICE_SILENCE_GRACE_MS + 900)
  assert.ok(gate.progress < progressBeforeSilence)
  assert.ok(gate.progress > 0)
})

test('ambient baseline adapts while quiet and raises the loudness threshold', () => {
  let gate = calibratedGate(0.04)
  const originalBaseline = gate.baseline
  const originalThreshold = gate.threshold
  gate = advanceVocalGate(gate, 0.05, VOICE_CALIBRATION_MS + 20)
  assert.ok(gate.baseline > originalBaseline)
  assert.ok(gate.threshold > originalThreshold)
  assert.equal(gate.triggered, false)
})

test('unsupported speech recognition is detected without affecting sound fallback', () => {
  assert.equal(speechRecognitionSupported({}), false)
  assert.equal(speechRecognitionSupported({ webkitSpeechRecognition: class {} }), true)
})
