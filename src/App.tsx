import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAudioManager } from './audio/useAudioManager'
import { CameraPreview } from './components/CameraPreview'
import { FlowerArt } from './components/FlowerArt'
import { GardenScene } from './components/GardenScene'
import { useAssetMap } from './data/assets'
import { FLOWERS, type FlowerChoice, type FlowerId } from './data/flowers'
import {
  completeGameStep,
  plantSelectedSeed,
  resetGameProgress,
  saveCompletedFlower,
  selectSeed,
  type GameStep,
} from './game/gameState'
import { loadCompletedFlowers, saveCompletedFlowers } from './game/progressStorage'
import { useFallbackTimer } from './hooks/useFallbackTimer'
import { useHandTracking } from './hooks/useHandTracking'
import { useVoiceTrigger } from './hooks/useVoiceTrigger'
import type { SeedInteractionDebug } from './types/interaction'

const STEP_COPY: Record<Exclude<GameStep, 'welcome' | 'choose' | 'reveal' | 'final'>, {
  eyebrow: string
  title: string
  instruction: string
  touchLabel: string
}> = {
  plant: {
    eyebrow: 'Plant the seed',
    title: 'Pinch your fingers',
    instruction: 'Bring your thumb and finger together.',
    touchLabel: 'Drag the seed',
  },
  sun: {
    eyebrow: 'Warm the soil',
    title: 'Show an open hand',
    instruction: 'Hold your palm toward the camera.',
    touchLabel: 'Tap the sun',
  },
  rain: {
    eyebrow: 'Give it water',
    title: 'Wave your hand',
    instruction: 'Move gently from side to side.',
    touchLabel: 'Tap the cloud',
  },
  grow: {
    eyebrow: 'Help it grow',
    title: 'Say “Grow”',
    instruction: 'Say grow, bloom, flower, or make one clear, steady sound.',
    touchLabel: 'Tap to Grow',
  },
}

function App() {
  const { assets, error: assetError } = useAssetMap()
  const [step, setStep] = useState<GameStep>('welcome')
  const [selected, setSelected] = useState<FlowerChoice | null>(null)
  const [completed, setCompleted] = useState<FlowerId[]>(loadCompletedFlowers)
  const [voiceStarted, setVoiceStarted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [interactionDebug, setInteractionDebug] = useState<SeedInteractionDebug>({
    phase: 'idle',
    hoveredPacket: null,
    grabbedSeed: null,
    dropZoneOverlap: false,
  })
  const fallbackReady = useFallbackTimer(`${step}-${selected?.id ?? ''}`, 5000)
  const lastTouchFallbackRef = useRef(0)
  const touchFallbackPendingRef = useRef(false)
  const touchFallbackTimerRef = useRef<number | null>(null)
  const { muted, play: playSound, toggleMuted } = useAudioManager()

  const {
    videoRef,
    status: handStatus,
    cursor,
    gestureEvent,
    pinchEvent,
    debug: handDebug,
    enableCamera,
    retryCamera,
    disableCamera,
  } = useHandTracking()

  const completeCurrentStep = useCallback(() => {
    setStep(completeGameStep)
  }, [])

  const completeGrowStep = useCallback(() => {
    void playSound('sprout')
    completeCurrentStep()
  }, [completeCurrentStep, playSound])

  const {
    status: voiceStatus,
    level: voiceLevel,
    soundProgress,
    transcript: voiceTranscript,
    feedback: voiceFeedback,
    speechSupported,
    start: startVoice,
    stop: stopVoice,
    recalibrate: recalibrateVoice,
  } = useVoiceTrigger(completeGrowStep)

  useEffect(() => {
    if (!gestureEvent) return

    if (step === 'sun' && gestureEvent.name === 'open-palm') {
      void playSound('sunlight')
      completeCurrentStep()
    }
    if (step === 'rain' && gestureEvent.name === 'wave') {
      void playSound('rain')
      completeCurrentStep()
    }
  }, [gestureEvent, step, completeCurrentStep, playSound])

  useEffect(() => {
    if (step !== 'grow') {
      setVoiceStarted(false)
      stopVoice()
    }
  }, [step, stopVoice])

  useEffect(() => {
    saveCompletedFlowers(completed)
  }, [completed])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion)
  }, [reducedMotion])

  useEffect(() => () => {
    if (touchFallbackTimerRef.current !== null) window.clearTimeout(touchFallbackTimerRef.current)
  }, [])

  useEffect(() => {
    if (step === 'welcome' || step === 'final') disableCamera()
  }, [disableCamera, step])

  useEffect(() => {
    if (step === 'reveal') void playSound('flower-bloom')
    if (step === 'final') void playSound('final-garden')
  }, [playSound, step])

  const planted = ['sun', 'rain', 'grow', 'reveal'].includes(step)
  const sunny = ['rain', 'grow', 'reveal'].includes(step)
  const raining = step === 'grow'
  const grown = step === 'reveal'

  const currentStepCopy = useMemo(() => {
    if (step === 'plant' || step === 'sun' || step === 'rain' || step === 'grow') {
      return STEP_COPY[step]
    }
    return null
  }, [step])

  const begin = () => {
    void playSound('button-tap')
    if (completed.length === FLOWERS.length) setStep('final')
    else setStep('choose')
  }

  const plantFlower = (flower: FlowerChoice) => {
    const next = plantSelectedSeed(selectSeed(flower.id))
    setSelected(flower)
    setStep(next.step)
  }

  const saveFlower = () => {
    if (!selected) return
    void playSound('button-tap')
    const next = saveCompletedFlower(completed, selected.id, FLOWERS.length)
    setCompleted(next.completed)
    setSelected(null)
    setStep(next.step)
  }

  const resetGarden = () => {
    void playSound('button-tap')
    const next = resetGameProgress()
    setCompleted(next.completed)
    setSelected(null)
    setStep(next.step)
  }

  const useTouchFallback = () => {
    if (step === 'grow') {
      stopVoice()
      void playSound('sprout')
    } else if (step === 'sun') {
      void playSound('sunlight')
    } else if (step === 'rain') {
      void playSound('rain')
    } else {
      void playSound('button-tap')
    }
    completeCurrentStep()
  }

  if (!assets) {
    return (
      <main className="app-shell app-shell--loading">
        <section className="asset-loading" aria-live="polite">
          <p className="eyebrow">Bloom With Me</p>
          <h1>{assetError ? 'The garden could not open.' : 'Opening the garden…'}</h1>
          <p>{assetError ? 'Please refresh and try again.' : 'Gathering the storybook artwork.'}</p>
          {assetError && (
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
        </section>
      </main>
    )
  }

  const availableFlowers = FLOWERS.filter((flower) => !completed.includes(flower.id))
  const gestureAsset = step === 'plant'
    ? assets.gestures.pinch
    : step === 'sun'
      ? assets.gestures.palm
      : step === 'rain'
        ? assets.gestures.wave
        : assets.ui.microphone

  return (
    <main className="app-shell">
      <button
        className="motion-toggle"
        type="button"
        onClick={() => {
          void playSound('button-tap')
          setReducedMotion((value) => !value)
        }}
        aria-pressed={reducedMotion}
      >
        {reducedMotion ? 'Gentle motion on' : 'Reduce motion'}
      </button>

      {step === 'welcome' && (
        <section className="welcome-screen">
          <GardenScene
            assets={assets}
            step="welcome"
            selected={null}
            completed={[]}
            planted={false}
            sunny={false}
            raining={false}
            grown={false}
          />
          <div className="welcome-card">
            <p className="eyebrow">A calm garden game</p>
            <h1>Bloom With Me</h1>
            <p className="welcome-copy">Use your hand, your voice, or simply touch the screen.</p>
            <button className="primary-button" type="button" onClick={begin}>Start garden</button>
            <p className="privacy-note">Camera and microphone are used only while you play.</p>
          </div>
        </section>
      )}

      {step !== 'welcome' && (
        <section className="game-layout">
          <header className="game-header">
            <div>
              <p className="game-brand">Bloom With Me</p>
              <p className="game-progress">{completed.length} of 3 flowers</p>
            </div>
            <div className="game-header__status">
              <button
                className="sound-status"
                type="button"
                aria-pressed={!muted}
                aria-label={muted ? 'Turn sound on' : 'Mute sound'}
                onClick={() => void toggleMuted()}
              >
                <span className="ui-icon-frame ui-icon-frame--trim" aria-hidden="true">
                  <img src={assets.ui.sound} alt="" />
                </span>
                <span className="sound-status__label">Sound {muted ? 'off' : 'on'}</span>
              </button>
              <div
                className="progress-dots"
                role="progressbar"
                aria-label="Garden progress"
                aria-valuemin={0}
                aria-valuemax={FLOWERS.length}
                aria-valuenow={completed.length}
                aria-valuetext={`${completed.length} of 3 flowers complete`}
              >
                {FLOWERS.map((flower) => (
                  <span key={flower.id} className={completed.includes(flower.id) ? 'is-complete' : ''} aria-hidden="true" />
                ))}
              </div>
            </div>
          </header>

          <div className="play-area">
            <GardenScene
              assets={assets}
              step={step}
              selected={selected}
              completed={completed}
              availableFlowers={availableFlowers}
              onPlantFlower={plantFlower}
              onSeedPickup={() => void playSound('seed-pickup')}
              onSeedDrop={() => void playSound('seed-drop')}
              onInteractionDebug={setInteractionDebug}
              handCursor={cursor}
              pinchEvent={pinchEvent}
              pinchState={handDebug.pinchState}
              planted={planted}
              sunny={sunny}
              raining={raining}
              grown={grown}
            />

            <CameraPreview
              videoRef={videoRef}
              status={handStatus}
              debug={handDebug}
              interaction={interactionDebug}
              cameraIcon={assets.ui.camera}
              onEnable={() => void enableCamera()}
              onRetry={() => void retryCamera()}
              onDisable={disableCamera}
            />

            <div className="instruction-panel" aria-live="polite">
              {step === 'choose' && (
                <>
                  <p className="eyebrow">Choose a seed</p>
                  <h2>Which flower will you grow?</h2>
                  <p className="instruction-copy">Pinch or drag a storybook packet, then release its seed over the pot.</p>
                  <p className={`touch-drag-hint ${fallbackReady ? 'touch-drag-hint--ready' : ''}`}>
                    Use touch: Drag the seed packet to the pot.
                  </p>
                </>
              )}

              {currentStepCopy && (
                <>
                  <p className="eyebrow">{currentStepCopy.eyebrow}</p>
                  <h2>{currentStepCopy.title}</h2>
                  <p className="instruction-copy">{currentStepCopy.instruction}</p>

                  {!(step === 'grow' && voiceStarted) && (
                    <div className={`gesture-demo gesture-demo--${step}`} aria-hidden="true">
                      <img src={gestureAsset} alt="" />
                    </div>
                  )}

                  {step === 'grow' && !voiceStarted && (
                    <button
                      className="voice-button"
                      type="button"
                      onClick={() => {
                        void playSound('button-tap')
                        setVoiceStarted(true)
                        void startVoice()
                      }}
                    >
                      <span className="ui-icon-frame ui-icon-frame--trim" aria-hidden="true">
                        <img src={assets.ui.microphone} alt="" />
                      </span>
                      Tap the microphone
                    </button>
                  )}

                  {step === 'grow' && voiceStarted && (
                    <div className="voice-status" role="status">
                      <strong>{voiceFeedback}</strong>
                      {voiceStatus === 'calibrating' && <span className="voice-status__secondary">Finding the quiet around you…</span>}
                      {voiceStatus === 'denied' && <span className="voice-status__secondary">Microphone is off. Tap to Grow still works.</span>}
                      {voiceStatus === 'unavailable' && <span className="voice-status__secondary">Voice is not available here. Tap to Grow still works.</span>}
                      {!speechSupported && voiceStatus !== 'denied' && voiceStatus !== 'unavailable' && (
                        <span className="voice-status__secondary">Voice is not available here. A long sound still works.</span>
                      )}
                      {voiceTranscript && <span className="voice-status__transcript">Heard: “{voiceTranscript}”</span>}
                      <div
                        className="voice-meter"
                        role="progressbar"
                        aria-label="Microphone level"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(voiceLevel * 100)}
                      >
                        <span style={{ transform: `scaleX(${Math.max(0.03, voiceLevel)})` }} />
                        <i style={{ transform: `scaleX(${soundProgress})` }} />
                      </div>
                      {(voiceStatus === 'calibrating' || voiceStatus === 'listening') && (
                        <button className="recalibrate-button" type="button" onClick={recalibrateVoice}>Recalibrate</button>
                      )}
                      {(voiceStatus === 'denied' || voiceStatus === 'unavailable') && (
                        <button
                          className="recalibrate-button"
                          type="button"
                          onClick={() => void startVoice()}
                        >
                          Try microphone again
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    className={`fallback-button ${step === 'grow' ? 'grow-touch-fallback' : ''} ${fallbackReady ? 'fallback-button--ready grow-touch-fallback--ready' : ''}`}
                    type="button"
                    onPointerDown={(event) => {
                      if (event.pointerType === 'touch') event.preventDefault()
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== 'touch' || touchFallbackPendingRef.current) return
                      event.preventDefault()
                      lastTouchFallbackRef.current = performance.now()
                      touchFallbackPendingRef.current = true
                      // Let the current touch/click sequence finish before replacing
                      // this control with the next stage's control.
                      touchFallbackTimerRef.current = window.setTimeout(() => {
                        touchFallbackTimerRef.current = null
                        touchFallbackPendingRef.current = false
                        useTouchFallback()
                      }, 80)
                    }}
                    onClick={(event) => {
                      const followsHandledTouch = event.detail !== 0 && performance.now() - lastTouchFallbackRef.current < 600
                      if (!followsHandledTouch) useTouchFallback()
                    }}
                  >
                    <span className="ui-icon-frame" aria-hidden="true">
                      <img src={assets.ui.help} alt="" />
                    </span>
                    {currentStepCopy.touchLabel}
                  </button>
                </>
              )}

              {step === 'reveal' && selected && (
                <>
                  <p className="eyebrow">It grew!</p>
                  <h2>You helped the {selected.name.toLowerCase()} grow.</h2>
                  <FlowerArt flower={selected} frames={assets.flowers[selected.id]} grown compact />
                  <button className="primary-button" type="button" onClick={saveFlower}>
                    Add to my garden
                  </button>
                </>
              )}

              {step === 'final' && (
                <>
                  <p className="eyebrow">Your garden is ready</p>
                  <h2>Your garden is beautiful.</h2>
                  <p className="instruction-copy">You helped every flower grow in your own way.</p>
                  <div className="final-flowers">
                    {FLOWERS.map((flower) => (
                      <FlowerArt key={flower.id} flower={flower} frames={assets.flowers[flower.id]} grown compact />
                    ))}
                  </div>
                  <button className="primary-button" type="button" onClick={resetGarden}>
                    <span className="ui-icon-frame ui-icon-frame--trim-right" aria-hidden="true">
                      <img src={assets.ui.restart} alt="" />
                    </span>
                    Grow again
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
