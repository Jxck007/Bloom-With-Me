import { useCallback, useEffect, useMemo, useState } from 'react'
import { CameraPreview } from './components/CameraPreview'
import { FlowerArt } from './components/FlowerArt'
import { GardenScene } from './components/GardenScene'
import { useAssetMap } from './data/assets'
import { FLOWERS, type FlowerChoice, type FlowerId } from './data/flowers'
import { useFallbackTimer } from './hooks/useFallbackTimer'
import { useHandTracking } from './hooks/useHandTracking'
import { useVoiceTrigger } from './hooks/useVoiceTrigger'
import type { SeedInteractionDebug } from './types/interaction'

type GameStep = 'welcome' | 'choose' | 'plant' | 'sun' | 'rain' | 'grow' | 'reveal' | 'final'

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
    touchLabel: 'Plant with touch',
  },
  sun: {
    eyebrow: 'Warm the soil',
    title: 'Show an open hand',
    instruction: 'Hold your palm toward the camera.',
    touchLabel: 'Bring the sun',
  },
  rain: {
    eyebrow: 'Give it water',
    title: 'Wave your hand',
    instruction: 'Move gently from side to side.',
    touchLabel: 'Make soft rain',
  },
  grow: {
    eyebrow: 'Help it grow',
    title: 'Say “Grow”',
    instruction: '“Go”, “Bloom”, or any clear sound also works.',
    touchLabel: 'Grow with touch',
  },
}

function App() {
  const { assets, error: assetError } = useAssetMap()
  const [step, setStep] = useState<GameStep>('welcome')
  const [selected, setSelected] = useState<FlowerChoice | null>(null)
  const [completed, setCompleted] = useState<FlowerId[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bloom-with-me-progress') ?? '[]') as FlowerId[]
    } catch {
      return []
    }
  })
  const [voiceStarted, setVoiceStarted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [interactionDebug, setInteractionDebug] = useState<SeedInteractionDebug>({
    phase: 'idle',
    hoveredPacket: null,
    grabbedSeed: null,
    dropZoneOverlap: false,
  })
  const fallbackReady = useFallbackTimer(`${step}-${selected?.id ?? ''}`, 5000)

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
    setStep((current) => {
      if (current === 'plant') return 'sun'
      if (current === 'sun') return 'rain'
      if (current === 'rain') return 'grow'
      if (current === 'grow') return 'reveal'
      return current
    })
  }, [])

  const { status: voiceStatus, level: voiceLevel, transcript: voiceTranscript, start: startVoice, stop: stopVoice } = useVoiceTrigger(
    completeCurrentStep,
  )

  useEffect(() => {
    if (!gestureEvent) return

    if (step === 'sun' && gestureEvent.name === 'open-palm') completeCurrentStep()
    if (step === 'rain' && gestureEvent.name === 'wave') completeCurrentStep()
  }, [gestureEvent, step, completeCurrentStep])

  useEffect(() => {
    if (step !== 'grow') {
      setVoiceStarted(false)
      stopVoice()
    }
  }, [step, stopVoice])

  useEffect(() => {
    localStorage.setItem('bloom-with-me-progress', JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    if (step === 'welcome' || step === 'final') disableCamera()
  }, [disableCamera, step])

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
    if (completed.length === FLOWERS.length) setStep('final')
    else setStep('choose')
  }

  const plantFlower = (flower: FlowerChoice) => {
    setSelected(flower)
    setStep('sun')
  }

  const saveFlower = () => {
    if (!selected) return
    const nextCompleted = completed.includes(selected.id)
      ? completed
      : [...completed, selected.id]
    setCompleted(nextCompleted)
    setSelected(null)
    setStep(nextCompleted.length === FLOWERS.length ? 'final' : 'choose')
  }

  const resetGarden = () => {
    setCompleted([])
    setSelected(null)
    setStep('choose')
  }

  const useTouchFallback = () => {
    if (step === 'grow') stopVoice()
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
        onClick={() => setReducedMotion((value) => !value)}
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
              <span className="sound-status" aria-label="Sound is muted">
                <span className="ui-icon-frame ui-icon-frame--trim" aria-hidden="true">
                  <img src={assets.ui.sound} alt="" />
                </span>
                Sound off
              </span>
              <div className="progress-dots" aria-label={`${completed.length} of 3 flowers complete`}>
                {FLOWERS.map((flower) => (
                  <span key={flower.id} className={completed.includes(flower.id) ? 'is-complete' : ''} />
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
                    Use touch: drag a packet to the pot.
                  </p>
                </>
              )}

              {currentStepCopy && (
                <>
                  <p className="eyebrow">{currentStepCopy.eyebrow}</p>
                  <h2>{currentStepCopy.title}</h2>
                  <p className="instruction-copy">{currentStepCopy.instruction}</p>

                  <div className={`gesture-demo gesture-demo--${step}`} aria-hidden="true">
                    <img src={gestureAsset} alt="" />
                  </div>

                  {step === 'grow' && !voiceStarted && (
                    <button
                      className="voice-button"
                      type="button"
                      onClick={() => {
                        setVoiceStarted(true)
                        void startVoice()
                      }}
                    >
                      <span className="ui-icon-frame ui-icon-frame--trim" aria-hidden="true">
                        <img src={assets.ui.microphone} alt="" />
                      </span>
                      Start listening
                    </button>
                  )}

                  {step === 'grow' && voiceStarted && (
                    <div className="voice-status">
                      <span
                        className="voice-status__meter"
                        style={{ transform: `scaleX(${Math.max(0.08, voiceLevel)})` }}
                      />
                      <span>
                        {voiceStatus === 'starting' && 'Opening microphone…'}
                        {voiceStatus === 'listening' && 'Listening for your voice…'}
                        {voiceStatus === 'denied' && 'Microphone is off. Touch still works.'}
                        {voiceStatus === 'unavailable' && 'Voice is unavailable. Touch still works.'}
                        {voiceStatus === 'heard' && 'I heard you!'}
                        {voiceStatus === 'listening' && voiceTranscript && ` Heard: “${voiceTranscript}”`}
                      </span>
                    </div>
                  )}

                  <button
                    className={`fallback-button ${fallbackReady ? 'fallback-button--ready' : ''}`}
                    type="button"
                    onClick={useTouchFallback}
                  >
                    <span className="ui-icon-frame" aria-hidden="true">
                      <img src={assets.ui.help} alt="" />
                    </span>
                    {fallbackReady ? currentStepCopy.touchLabel : 'Use touch instead'}
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
