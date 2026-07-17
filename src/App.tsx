import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAudioManager } from './audio/useAudioManager'
import { CameraPreview } from './components/CameraPreview'
import { GardenScene, type WeatherState } from './components/GardenScene'
import { AssetImage } from './components/AssetImage'
import { useAssetMap } from './data/assets'
import { FLOWERS, type FlowerChoice } from './data/flowers'
import { completeGameStep, plantSelectedSeed, selectSeed, type GameStep } from './game/gameState'
import {
  clearGardenData,
  createEmptyGarden,
  ensureActivePageHasSpace,
  gardenFlowerCount,
  loadGardenData,
  plantGardenFlower,
  saveGardenData,
  setActiveGardenPage,
  type GardenData,
} from './game/gardenStorage'
import { useFallbackTimer } from './hooks/useFallbackTimer'
import { useHandTracking, type TrackingStatus } from './hooks/useHandTracking'
import { useMediaPermissions } from './hooks/useMediaPermissions'
import { useVoiceTrigger } from './hooks/useVoiceTrigger'
import {
  initialGrowGestureTracker,
  updateCloseOpenGrow,
  type GrowGesturePhase,
  type GrowPoseObservation,
} from './gesture/gestureMath'
import type { SeedInteractionDebug } from './types/interaction'

const SUN_HOLD_MS = 900
const SUN_RESULT_MS = 1_450
const SUN_EXIT_MS = 500
const RAIN_DURATION_MS = 4_800
const CLOUD_ENTER_MS = 850
const CLOUD_CLEAR_MS = 1_450

const STEP_COPY: Record<Exclude<GameStep, 'welcome' | 'choose' | 'place'>, {
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
    touchLabel: 'Tap or swipe the cloud',
  },
  grow: {
    eyebrow: 'Help it grow',
    title: 'Close your hand, then open it.',
    instruction: 'Or say Grow, make a sound, or tap below.',
    touchLabel: 'Tap to Grow',
  },
}

function App() {
  const { assets, error: assetError } = useAssetMap()
  const [step, setStep] = useState<GameStep>('welcome')
  const [selected, setSelected] = useState<FlowerChoice | null>(null)
  const [garden, setGarden] = useState<GardenData>(loadGardenData)
  const [voiceStarted, setVoiceStarted] = useState(false)
  const [growGesturePhase, setGrowGesturePhase] = useState<GrowGesturePhase>('waitingForHand')
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [sunCelebrating, setSunCelebrating] = useState(false)
  const [sunExiting, setSunExiting] = useState(false)
  const [sunHoldMs, setSunHoldMs] = useState(0)
  const [weatherState, setWeatherState] = useState<WeatherState>('clear')
  const [rainGestureArmed, setRainGestureArmed] = useState(false)
  const [rainGuide, setRainGuide] = useState<'Release your hand' | 'Open your hand' | 'Move left' | 'Move right' | 'One more time'>('Release your hand')
  const [growthStarted, setGrowthStarted] = useState(false)
  const [plantMessage, setPlantMessage] = useState('')
  const [interactionDebug, setInteractionDebug] = useState<SeedInteractionDebug>({
    phase: 'idle',
    hoveredPacket: null,
    grabbedSeed: null,
    dropZoneOverlap: false,
  })
  const fallbackReady = useFallbackTimer(`${step}-${selected?.id ?? ''}-${weatherState}`, 5000)
  const lastTouchFallbackRef = useRef(0)
  const touchFallbackPendingRef = useRef(false)
  const touchFallbackTimerRef = useRef<number | null>(null)
  const transitionTimersRef = useRef(new Set<number>())
  const plantingTimerRef = useRef<number | null>(null)
  const palmHoldStartedRef = useRef<number | null>(null)
  const rainMotionRef = useRef({ x: null as number | null, direction: 0, changes: 0 })
  const stepRef = useRef<GameStep>(step)
  const weatherStateRef = useRef<WeatherState>(weatherState)
  const gardenRef = useRef(garden)
  const selectedRef = useRef(selected)
  const growthStartedRef = useRef(false)
  const weatherBusyRef = useRef(false)
  const placingRef = useRef(false)
  const growGestureRef = useRef(initialGrowGestureTracker())
  const { muted, play: playSound, toggleMuted } = useAudioManager()
  const media = useMediaPermissions()

  stepRef.current = step
  weatherStateRef.current = weatherState
  gardenRef.current = garden
  selectedRef.current = selected
  growthStartedRef.current = growthStarted

  const {
    videoRef,
    status: handStatus,
    cursor,
    gestureEvent,
    pinchEvent,
    debug: handDebug,
    enableCameraWithStream,
    disableCamera,
  } = useHandTracking()

  const scheduleTransition = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      transitionTimersRef.current.delete(timer)
      callback()
    }, delay)
    transitionTimersRef.current.add(timer)
  }, [])

  const commitGarden = useCallback((next: GardenData) => {
    gardenRef.current = next
    setGarden(next)
    saveGardenData(next)
  }, [])

  const startGrowth = useCallback(() => {
    if (stepRef.current !== 'grow' || growthStartedRef.current) return
    growthStartedRef.current = true
    setGrowthStarted(true)
    void playSound('sprout')
  }, [playSound])

  const {
    status: voiceStatus,
    level: voiceLevel,
    soundProgress,
    transcript: voiceTranscript,
    feedback: voiceFeedback,
    start: startVoice,
    stop: stopVoice,
  } = useVoiceTrigger(startGrowth)

  useEffect(() => {
    if (step !== 'grow' || growthStarted) return
    const observation: GrowPoseObservation = !handDebug.handVisible
      ? 'none'
      : handDebug.currentGesture === 'fist'
        ? 'fist'
        : handDebug.currentGesture === 'open-palm'
          ? 'open'
          : 'other'
    const next = updateCloseOpenGrow(growGestureRef.current, observation, performance.now())
    growGestureRef.current = next.tracker
    setGrowGesturePhase((current) => current === next.tracker.phase ? current : next.tracker.phase)
    if (next.confirmed) startGrowth()
  }, [growthStarted, handDebug.currentGesture, handDebug.handVisible, handDebug.landmarks, startGrowth, step])

  const finishSunStage = useCallback(() => {
    if (stepRef.current !== 'sun' || weatherBusyRef.current) return
    weatherBusyRef.current = true
    setSunHoldMs(SUN_HOLD_MS)
    setSunExiting(false)
    setSunCelebrating(true)
    void playSound('sunlight')
    scheduleTransition(() => {
      setSunCelebrating(false)
      setSunExiting(true)
      scheduleTransition(() => {
        setSunExiting(false)
        setRainGestureArmed(false)
        setRainGuide('Release your hand')
        setWeatherState('cloudEntering')
        setStep('rain')
        scheduleTransition(() => {
          setWeatherState('cloudy')
          weatherBusyRef.current = false
        }, CLOUD_ENTER_MS)
      }, SUN_EXIT_MS)
    }, SUN_RESULT_MS)
  }, [playSound, scheduleTransition])

  const finishRainStage = useCallback(() => {
    if (stepRef.current !== 'rain' || weatherStateRef.current !== 'cloudy' || weatherBusyRef.current) return
    weatherBusyRef.current = true
    setWeatherState('raining')
    void playSound('rain')
    scheduleTransition(() => {
      setWeatherState('clearing')
      scheduleTransition(() => {
        setWeatherState('clear')
        weatherBusyRef.current = false
        setStep('grow')
      }, CLOUD_CLEAR_MS)
    }, RAIN_DURATION_MS)
  }, [playSound, scheduleTransition])

  useEffect(() => {
    if (step !== 'sun' || sunCelebrating || !handDebug.handVisible || handDebug.currentGesture !== 'open-palm') {
      palmHoldStartedRef.current = null
      if (step === 'sun' && !sunCelebrating) setSunHoldMs(0)
      return
    }
    const now = performance.now()
    if (palmHoldStartedRef.current === null) palmHoldStartedRef.current = now
    const heldFor = now - palmHoldStartedRef.current
    setSunHoldMs(Math.min(SUN_HOLD_MS, heldFor))
    if (heldFor >= SUN_HOLD_MS) finishSunStage()
  }, [finishSunStage, handDebug.currentGesture, handDebug.handVisible, handDebug.landmarks, step, sunCelebrating])

  useEffect(() => {
    if (step !== 'rain' || weatherState !== 'cloudy' || rainGestureArmed) return
    const neutralGesture = !handDebug.handVisible
      || (handDebug.currentGesture !== 'open-palm' && handDebug.currentGesture !== 'wave' && handDebug.currentGesture !== 'pinch')
    if (neutralGesture) {
      setRainGestureArmed(true)
      setRainGuide('Open your hand')
    }
  }, [handDebug.currentGesture, handDebug.handVisible, rainGestureArmed, step, weatherState])

  useEffect(() => {
    if (step === 'rain' && weatherState === 'cloudy' && rainGestureArmed && gestureEvent?.name === 'wave') finishRainStage()
  }, [finishRainStage, gestureEvent, rainGestureArmed, step, weatherState])

  useEffect(() => {
    if (step !== 'rain' || weatherState !== 'cloudy' || !rainGestureArmed || !handDebug.handVisible || (handDebug.currentGesture !== 'open-palm' && handDebug.currentGesture !== 'wave')) {
      rainMotionRef.current = { x: null, direction: 0, changes: 0 }
      return
    }
    const x = handDebug.cursorX
    if (x === null) return
    const motion = rainMotionRef.current
    if (motion.x === null) {
      motion.x = x
      setRainGuide('Move left')
      return
    }
    const delta = x - motion.x
    if (Math.abs(delta) < 0.025) return
    const direction = Math.sign(delta)
    if (motion.direction && direction !== motion.direction) motion.changes += 1
    motion.direction = direction
    motion.x = x
    setRainGuide(motion.changes >= 2 ? 'One more time' : direction < 0 ? 'Move right' : 'Move left')
  }, [handDebug.currentGesture, handDebug.cursorX, handDebug.handVisible, rainGestureArmed, step, weatherState])

  useEffect(() => {
    if (step !== 'grow') {
      setVoiceStarted(false)
      setGrowthStarted(false)
      growthStartedRef.current = false
      growGestureRef.current = initialGrowGestureTracker()
      setGrowGesturePhase('waitingForHand')
      stopVoice()
    } else if (growthStarted) {
      stopVoice()
    } else if (media.microphone === 'ready' && media.stream && !voiceStarted) {
      setVoiceStarted(true)
      void startVoice(media.stream)
    }
  }, [growthStarted, media.microphone, media.stream, startVoice, step, stopVoice, voiceStarted])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 160)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => () => {
    if (touchFallbackTimerRef.current !== null) window.clearTimeout(touchFallbackTimerRef.current)
    if (plantingTimerRef.current !== null) window.clearTimeout(plantingTimerRef.current)
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimersRef.current.clear()
  }, [])

  useEffect(() => {
    if (step === 'welcome') disableCamera()
  }, [disableCamera, step])

  const planted = ['sun', 'rain', 'grow', 'place'].includes(step)
  const sunny = step === 'sun' && sunCelebrating
  const watered = weatherState === 'clearing' || step === 'grow' || step === 'place'
  const flowerCount = gardenFlowerCount(garden)

  const currentStepCopy = useMemo(() => ['plant', 'sun', 'rain', 'grow'].includes(step)
    ? STEP_COPY[step as 'plant' | 'sun' | 'rain' | 'grow']
    : null, [step])

  const beginTouchOnly = () => {
    void playSound('button-tap')
    setStep('choose')
  }

  const beginHandsAndVoice = async () => {
    if (media.status === 'requesting') return
    void playSound('button-tap')
    const result = await media.request()
    if (result.camera === 'ready' && result.stream) void enableCameraWithStream(result.stream)
    setStep('choose')
  }

  const fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function'
    && typeof document.exitFullscreen === 'function'

  const toggleFullscreen = async () => {
    if (!fullscreenSupported) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen may be blocked by browser or embedding policy; gameplay remains available.
    }
  }

  const cameraPreviewStatus: TrackingStatus = handStatus !== 'not-started'
    ? handStatus
    : media.camera === 'requesting'
      ? 'requesting'
      : media.camera === 'denied'
        ? 'permission-denied'
        : media.camera === 'unavailable'
          ? 'unavailable'
          : 'not-started'

  const selectFlower = (flower: FlowerChoice) => {
    const prepared = ensureActivePageHasSpace(gardenRef.current)
    if (prepared !== gardenRef.current) commitGarden(prepared)
    const next = selectSeed(flower.id)
    setPlantMessage('')
    setSunCelebrating(false)
    setSunExiting(false)
    setSelected(flower)
    setStep(next.step)
  }

  const plantSeed = () => {
    if (!selectedRef.current) return
    const next = plantSelectedSeed({ selected: selectedRef.current.id, step: stepRef.current })
    setWeatherState('clear')
    setStep(next.step)
  }

  const finishGrowth = useCallback(() => {
    if (stepRef.current !== 'grow') return
    void playSound('flower-bloom')
    setStep(completeGameStep('grow'))
  }, [playSound])

  const plantFlower = useCallback((slotIndex: number) => {
    if (stepRef.current !== 'place' || !selectedRef.current || placingRef.current) return false
    const next = plantGardenFlower(gardenRef.current, selectedRef.current.id, slotIndex)
    if (!next) return false
    placingRef.current = true
    commitGarden(next)
    setPlantMessage(`${selectedRef.current.name} planted in Garden ${next.activePageIndex + 1}.`)
    void playSound('seed-drop')
    plantingTimerRef.current = window.setTimeout(() => {
      plantingTimerRef.current = null
      placingRef.current = false
      setSelected(null)
      setStep('choose')
    }, reducedMotion ? 120 : 650)
    return true
  }, [commitGarden, playSound, reducedMotion])

  const changeGardenPage = useCallback((pageIndex: number) => {
    const next = setActiveGardenPage(gardenRef.current, pageIndex)
    if (next !== gardenRef.current) {
      void playSound('button-tap')
      commitGarden(next)
    }
  }, [commitGarden, playSound])

  const resetGarden = () => {
    if (!window.confirm('Reset every saved garden and start again? This cannot be undone.')) return
    void playSound('button-tap')
    clearGardenData()
    const empty = createEmptyGarden()
    gardenRef.current = empty
    setGarden(empty)
    setSelected(null)
    setPlantMessage('Garden reset.')
    setStep('choose')
  }

  const useTouchFallback = () => {
    if (step === 'grow') {
      stopVoice()
      startGrowth()
    } else if (step === 'sun') {
      finishSunStage()
    } else if (step === 'rain') {
      finishRainStage()
    } else {
      void playSound('button-tap')
    }
  }

  if (!assets) {
    return (
      <main className="app-shell app-shell--loading">
        <section className="asset-loading" aria-live="polite">
          <p className="eyebrow">Bloom With Me</p>
          <h1>{assetError ? 'The garden could not open.' : 'Opening the garden…'}</h1>
          <p>{assetError ? 'Please refresh and try again.' : 'Gathering the storybook artwork.'}</p>
          {assetError && <button className="primary-button" type="button" onClick={() => window.location.reload()}>Try again</button>}
        </section>
      </main>
    )
  }

  const stageTitle = step === 'sun'
    ? sunCelebrating
      ? 'Sunlight ready'
      : handDebug.currentGesture === 'open-palm'
        ? `Hold still ${Math.round((sunHoldMs / SUN_HOLD_MS) * 100)}%`
        : 'Open your hand'
    : step === 'rain'
      ? weatherState === 'cloudEntering'
        ? 'A cloud is coming'
        : weatherState === 'raining'
          ? 'Gentle rain'
          : weatherState === 'clearing'
            ? 'The rain is resting'
            : rainGuide
      : step === 'grow' && growthStarted
        ? 'Watch it grow'
        : currentStepCopy?.title
  const gestureAsset = step === 'plant'
    ? assets.gestures.pinch
    : step === 'sun'
      ? assets.gestures.palm
      : step === 'rain'
        ? assets.gestures.wave
        : assets.gestures.palm
  const growGestureCopy = growGesturePhase === 'fistHeld' || growGesturePhase === 'waitingForOpen'
    ? 'Now open it'
    : growGesturePhase === 'growConfirmed' || growthStarted
      ? 'Wonderful — let’s grow!'
      : 'Close your hand'

  return (
    <main className="app-shell">
      {step === 'welcome' && (
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
      )}

      {step === 'welcome' && (
        <section className="welcome-screen">
          <GardenScene
            assets={assets}
            step="welcome"
            selected={null}
            garden={garden}
            planted={false}
            sunny={false}
            watered={false}
            growthStarted={false}
            weatherState="clear"
            reducedMotion={reducedMotion}
          />
          <div className="welcome-card">
            <p className="eyebrow">A calm garden game</p>
            <h1>Bloom With Me</h1>
            <p className="welcome-copy">The camera supports hand gestures. The microphone listens for voice and sound. Touch always works too.</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void beginHandsAndVoice()}
              disabled={media.status === 'requesting'}
            >
              {media.status === 'requesting' ? 'Opening camera & microphone…' : 'Start Hands & Voice'}
            </button>
            <button className="touch-only-button" type="button" onClick={beginTouchOnly}>Continue with touch only</button>
            <p className="privacy-note">Camera and microphone are requested together only after you press Start Hands & Voice.</p>
          </div>
        </section>
      )}

      {step !== 'welcome' && (
        <section className="game-layout">
          <header className="game-header">
            <div>
              <p className="game-brand">Bloom With Me</p>
              <p className="game-progress">Garden flowers: {flowerCount}</p>
            </div>
            <div className="game-header__status">
              <div className="game-controls" aria-label="Game display and sound controls">
                <button className="sound-status" type="button" aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Mute sound'} onClick={() => void toggleMuted()}>
                  <span className="ui-icon-frame ui-icon-frame--trim" aria-hidden="true"><AssetImage src={assets.ui.sound} alt="" /></span>
                  <span className="sound-status__label">Sound {muted ? 'off' : 'on'}</span>
                </button>
                <button
                  className="header-control"
                  type="button"
                  onClick={() => {
                    void playSound('button-tap')
                    setReducedMotion((value) => !value)
                  }}
                  aria-pressed={reducedMotion}
                >
                  {reducedMotion ? 'Gentle motion' : 'Reduce motion'}
                </button>
                {fullscreenSupported && (
                  <button className="header-control" type="button" onClick={() => void toggleFullscreen()} aria-pressed={isFullscreen}>
                    <span className="header-control__icon" aria-hidden="true">{isFullscreen ? '×' : '⛶'}</span>
                    <span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
                  </button>
                )}
              </div>
              <details className="garden-options">
                <summary>Garden options</summary>
                <button type="button" onClick={resetGarden}>Reset saved gardens</button>
              </details>
            </div>
          </header>

          <div className="play-area">
            <GardenScene
              assets={assets}
              step={step}
              selected={selected}
              garden={garden}
              onGardenPageChange={changeGardenPage}
              onSelectFlower={selectFlower}
              onPlantSeed={plantSeed}
              onPlantFlower={plantFlower}
              onPlantRejected={(reason) => setPlantMessage(reason === 'occupied' ? 'That garden spot already has a flower. Try an empty spot.' : 'Bring the flower back to an empty soil spot.')}
              onSeedPickup={() => void playSound('seed-pickup')}
              onSeedDrop={() => void playSound('seed-drop')}
              onInteractionDebug={setInteractionDebug}
              onSunTap={finishSunStage}
              onCloudTap={finishRainStage}
              handCursor={cursor}
              pinchEvent={pinchEvent}
              pinchState={handDebug.pinchState}
              planted={planted}
              sunny={sunny}
              sunExiting={sunExiting}
              watered={watered}
              growthStarted={growthStarted}
              weatherState={weatherState}
              reducedMotion={reducedMotion}
              onGrowthComplete={finishGrowth}
            />

            <CameraPreview
              videoRef={videoRef}
              status={cameraPreviewStatus}
              debug={handDebug}
              interaction={interactionDebug}
              cameraIcon={assets.ui.camera}
              onEnable={() => void beginHandsAndVoice()}
              onRetry={() => void beginHandsAndVoice()}
              onDisable={disableCamera}
            />

            <div className="instruction-panel" aria-live="polite">
              {step === 'choose' && (
                <>
                  <p className="eyebrow">Choose a seed</p>
                  <h2>Which flower will you grow?</h2>
                  <p className="instruction-copy">Move the butterfly over a packet and pinch. Or tap a packet.</p>
                  <p className={`touch-drag-hint ${fallbackReady ? 'touch-drag-hint--ready' : ''}`}>Use touch: Tap a seed.</p>
                  {plantMessage && <p className="gentle-status" role="status">{plantMessage}</p>}
                </>
              )}

              {currentStepCopy && (
                <>
                  <p className="eyebrow">{currentStepCopy.eyebrow}</p>
                  <h2>{stageTitle}</h2>
                  <p className="instruction-copy">
                    {step === 'plant'
                      ? 'Pinch and hold the loose seed, then release it over the pot.'
                      : step === 'sun' && sunCelebrating
                        ? 'Warm light is settling over the soil.'
                        : step === 'rain' && weatherState === 'cloudEntering'
                          ? 'Wait for the soft cloud to settle above the pot.'
                          : step === 'rain' && weatherState === 'raining'
                            ? 'The drops are landing only in the pot.'
                            : step === 'rain' && weatherState === 'clearing'
                              ? 'The last drops are finishing before the flower grows.'
                              : step === 'rain'
                                ? rainGestureArmed ? 'Keep your palm open and wave gently left and right.' : 'Relax your hand once, then wave.'
                                : step === 'grow' && growthStarted
                                  ? 'The flower is opening through all six gentle stages.'
                                  : step === 'grow'
                                    ? 'Or say Grow, make a sound, or tap below.'
                                  : currentStepCopy.instruction}
                  </p>

                  {!(step === 'grow' && growthStarted) && (
                    <div className={`gesture-demo gesture-demo--${step}`} aria-hidden="true"><AssetImage src={gestureAsset} alt="" /></div>
                  )}

                  {step === 'grow' && !growthStarted && (
                    <p className={`grow-gesture-progress grow-gesture-progress--${growGesturePhase}`} role="status">
                      {growGestureCopy}
                    </p>
                  )}

                  {step === 'grow' && !growthStarted && voiceStarted && (
                    <div className="voice-listening" role="status">
                      <span>{voiceStatus === 'heard' ? voiceFeedback : 'Voice & sound listening'}</span>
                      {voiceTranscript && <span className="voice-status__transcript">Heard: “{voiceTranscript}”</span>}
                      <div className="voice-meter" role="progressbar" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(voiceLevel * 100)}>
                        <span style={{ transform: `scaleX(${Math.max(0.03, voiceLevel)})` }} />
                        <i style={{ transform: `scaleX(${soundProgress})` }} />
                      </div>
                    </div>
                  )}

                  {step === 'grow' && !growthStarted && media.microphone !== 'ready' && (
                    <p className="voice-unavailable">Voice is off. Hands and Tap to Grow still work.</p>
                  )}

                  {step === 'plant' ? (
                    <p className={`touch-drag-hint ${fallbackReady ? 'touch-drag-hint--ready' : ''}`}>Use touch: Drag the seed.</p>
                  ) : !(step === 'grow' && growthStarted) && (
                    <button
                      className={`fallback-button ${step === 'grow' ? 'grow-touch-fallback' : ''} ${fallbackReady ? 'fallback-button--ready grow-touch-fallback--ready' : ''}`}
                      type="button"
                      disabled={step === 'rain' && weatherState !== 'cloudy'}
                      onPointerDown={(event) => { if (event.pointerType === 'touch') event.preventDefault() }}
                      onPointerUp={(event) => {
                        if (event.pointerType !== 'touch' || touchFallbackPendingRef.current) return
                        event.preventDefault()
                        lastTouchFallbackRef.current = performance.now()
                        touchFallbackPendingRef.current = true
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
                      <span className="ui-icon-frame" aria-hidden="true"><AssetImage src={assets.ui.help} alt="" /></span>
                      {currentStepCopy.touchLabel}
                    </button>
                  )}
                </>
              )}

              {step === 'place' && selected && (
                <>
                  <p className="eyebrow">Into the garden</p>
                  <h2>Pinch the flower and place it in the garden.</h2>
                  <p className="instruction-copy">Release near an empty soil spot. The flower will gently snap in.</p>
                  <p className={`touch-drag-hint ${fallbackReady ? 'touch-drag-hint--ready' : ''}`}>Use touch: Drag the flower into the garden.</p>
                  {plantMessage && <p className="gentle-status" role="status">{plantMessage}</p>}
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
