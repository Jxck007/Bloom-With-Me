import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import {
  advanceStablePinch,
  initialStablePinchTracker,
  isOpenPalm,
  isWaving,
  openPalmScore,
  pinchRatio,
  pinchScore,
  PINCH_LOST_FRAME_TOLERANCE,
  waveScore,
  type GestureName,
  type WristSample,
} from '../gesture/gestureMath'

export interface GestureEvent { id: number; name: GestureName }
export interface PinchEvent {
  id: number
  phase: 'start' | 'release'
  reason: 'gesture' | 'lost'
}
export interface CursorPoint { x: number; y: number; visible: boolean }
export type PinchState = 'open' | 'pinching'
export type TrackingStatus =
  | 'not-started'
  | 'requesting'
  | 'active'
  | 'permission-denied'
  | 'unavailable'
  | 'unsupported'
  | 'retrying'
export type DetectorDelegate = 'GPU' | 'CPU' | 'none'

export interface HandDebug {
  handVisible: boolean
  landmarks: NormalizedLandmark[]
  currentGesture: GestureName | 'hand-visible' | 'none'
  confidence: number
  handedness: string
  pinchRatio: number | null
  pinchState: PinchState
  lostFrameCount: number
  delegate: DetectorDelegate
  processingFps: number
  cameraWidth: number
  cameraHeight: number
  cursorX: number | null
  cursorY: number | null
}

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const DETECTION_INTERVAL_MS = 40

function stopLiveTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop()
  })
}

const initialDebug = (): HandDebug => ({
  handVisible: false,
  landmarks: [],
  currentGesture: 'none',
  confidence: 0,
  handedness: '',
  pinchRatio: null,
  pinchState: 'open',
  lostFrameCount: 0,
  delegate: 'none',
  processingFps: 0,
  cameraWidth: 0,
  cameraHeight: 0,
  cursorX: null,
  cursorY: null,
})

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<TrackingStatus>('not-started')
  const [cursor, setCursor] = useState<CursorPoint>({ x: 0.5, y: 0.5, visible: false })
  const [gestureEvent, setGestureEvent] = useState<GestureEvent | null>(null)
  const [pinchEvent, setPinchEvent] = useState<PinchEvent | null>(null)
  const [debug, setDebug] = useState<HandDebug>(initialDebug)

  const mountedRef = useRef(true)
  const statusRef = useRef<TrackingStatus>('not-started')
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const landmarkerPromiseRef = useRef<Promise<HandLandmarker> | null>(null)
  const delegateRef = useRef<DetectorDelegate>('none')
  const frameRef = useRef<number | null>(null)
  const requestTokenRef = useRef(0)
  const lastDetectionRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const fpsWindowRef = useRef({ startedAt: 0, frames: 0, value: 0 })
  const eventIdRef = useRef(0)
  const pinchEventIdRef = useRef(0)
  const stableRef = useRef<Record<'open-palm' | 'wave', number>>({ 'open-palm': 0, wave: 0 })
  const cooldownRef = useRef(0)
  const wristHistoryRef = useRef<WristSample[]>([])
  const pinchStateRef = useRef<PinchState>('open')
  const pinchCandidateRef = useRef({ start: 0, release: 0 })
  const lostFrameRef = useRef(0)

  const setTrackingStatus = useCallback((next: TrackingStatus) => {
    statusRef.current = next
    if (mountedRef.current) setStatus(next)
  }, [])

  const emitPinch = useCallback((phase: PinchEvent['phase'], reason: PinchEvent['reason']) => {
    pinchEventIdRef.current += 1
    if (mountedRef.current) {
      setPinchEvent({ id: pinchEventIdRef.current, phase, reason })
    }
  }, [])

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const stopStream = useCallback(() => {
    const stream = streamRef.current
    streamRef.current = null
    stopLiveTracks(stream)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const resetTracking = useCallback(() => {
    const pinch = initialStablePinchTracker()
    stableRef.current = { 'open-palm': 0, wave: 0 }
    wristHistoryRef.current = []
    pinchStateRef.current = pinch.state
    pinchCandidateRef.current = { start: pinch.startFrames, release: pinch.releaseFrames }
    lostFrameRef.current = pinch.lostFrames
    lastDetectionRef.current = 0
    lastVideoTimeRef.current = -1
    fpsWindowRef.current = { startedAt: 0, frames: 0, value: 0 }
    if (mountedRef.current) {
      setCursor((current) => ({ ...current, visible: false }))
      setDebug({ ...initialDebug(), delegate: delegateRef.current })
    }
  }, [])

  const ensureLandmarker = useCallback(async (): Promise<HandLandmarker> => {
    if (landmarkerRef.current) return landmarkerRef.current
    if (landmarkerPromiseRef.current) return landmarkerPromiseRef.current

    const creation = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      const create = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      })

      try {
        const detector = await create('GPU')
        delegateRef.current = 'GPU'
        return detector
      } catch {
        const detector = await create('CPU')
        delegateRef.current = 'CPU'
        return detector
      }
    })()

    landmarkerPromiseRef.current = creation
    try {
      const detector = await creation
      if (!mountedRef.current) {
        detector.close()
        throw new Error('Hand detector was cancelled')
      }
      landmarkerRef.current = detector
      return detector
    } finally {
      landmarkerPromiseRef.current = null
    }
  }, [])

  const updatePinchState = useCallback((landmarks: NormalizedLandmark[] | null): PinchState => {
    const next = advanceStablePinch({
      state: pinchStateRef.current,
      startFrames: pinchCandidateRef.current.start,
      releaseFrames: pinchCandidateRef.current.release,
      lostFrames: lostFrameRef.current,
    }, landmarks ? pinchRatio(landmarks) : null)
    pinchStateRef.current = next.tracker.state
    pinchCandidateRef.current = { start: next.tracker.startFrames, release: next.tracker.releaseFrames }
    lostFrameRef.current = next.tracker.lostFrames
    if (next.transition && next.reason) emitPinch(next.transition, next.reason)
    return pinchStateRef.current
  }, [emitPinch])

  const processLandmarks = useCallback((landmarks: NormalizedLandmark[] | null, handedness = '', confidence = 0) => {
    const now = performance.now()
    const video = videoRef.current
    const nextPinchState = updatePinchState(landmarks)

    if (!landmarks) {
      stableRef.current = { 'open-palm': 0, wave: 0 }
      if (lostFrameRef.current > PINCH_LOST_FRAME_TOLERANCE || nextPinchState === 'open') {
        setCursor((current) => ({ ...current, visible: false }))
      }
      setDebug((current) => ({
        ...current,
        handVisible: false,
        landmarks: [],
        currentGesture: nextPinchState === 'pinching' ? 'pinch' : 'none',
        confidence: 0,
        handedness: '',
        pinchRatio: null,
        pinchState: nextPinchState,
        lostFrameCount: lostFrameRef.current,
        processingFps: fpsWindowRef.current.value,
        cameraWidth: video?.videoWidth ?? 0,
        cameraHeight: video?.videoHeight ?? 0,
      }))
      return
    }

    // MediaPipe coordinates are mirrored exactly once here for the garden cursor.
    const cursorX = 1 - landmarks[8].x
    const cursorY = landmarks[8].y
    setCursor({ x: cursorX, y: cursorY, visible: true })

    wristHistoryRef.current = [...wristHistoryRef.current, { x: 1 - landmarks[0].x, time: now }]
      .filter((sample) => now - sample.time < 1250)

    const scores = {
      'open-palm': openPalmScore(landmarks),
      wave: waveScore(wristHistoryRef.current),
    }
    const raw = {
      'open-palm': isOpenPalm(landmarks),
      wave: isOpenPalm(landmarks) && isWaving(wristHistoryRef.current),
    }
    const selected = (['wave', 'open-palm'] as const).find((gesture) => raw[gesture])

    for (const gesture of ['wave', 'open-palm'] as const) {
      stableRef.current[gesture] = gesture === selected
        ? stableRef.current[gesture] + 1
        : Math.max(0, stableRef.current[gesture] - 1)
    }

    if (selected) {
      const needed = selected === 'wave' ? 3 : 6
      if (stableRef.current[selected] >= needed && now >= cooldownRef.current) {
        eventIdRef.current += 1
        setGestureEvent({ id: eventIdRef.current, name: selected })
        cooldownRef.current = now + 1250
        stableRef.current[selected] = 0
        if (selected === 'wave') wristHistoryRef.current = []
      }
    }

    const ratio = pinchRatio(landmarks)
    const currentGesture = nextPinchState === 'pinching' ? 'pinch' : selected ?? 'hand-visible'
    const gestureConfidence = nextPinchState === 'pinching'
      ? pinchScore(landmarks)
      : selected
        ? scores[selected]
        : confidence

    setDebug({
      handVisible: true,
      landmarks,
      currentGesture,
      confidence: gestureConfidence,
      handedness,
      pinchRatio: ratio,
      pinchState: nextPinchState,
      lostFrameCount: lostFrameRef.current,
      delegate: delegateRef.current,
      processingFps: fpsWindowRef.current.value,
      cameraWidth: video?.videoWidth ?? 0,
      cameraHeight: video?.videoHeight ?? 0,
      cursorX,
      cursorY,
    })
  }, [updatePinchState])

  const startLoop = useCallback(() => {
    if (frameRef.current !== null || statusRef.current !== 'active' || document.hidden) return

    const loop = (now: number) => {
      frameRef.current = null
      if (statusRef.current !== 'active' || document.hidden) return

      const video = videoRef.current
      const detector = landmarkerRef.current
      if (video && detector && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const enoughTimePassed = now - lastDetectionRef.current >= DETECTION_INTERVAL_MS
        const hasNewFrame = video.currentTime !== lastVideoTimeRef.current
        if (enoughTimePassed && hasNewFrame) {
          lastDetectionRef.current = now
          lastVideoTimeRef.current = video.currentTime
          try {
            const result = detector.detectForVideo(video, now)
            const landmarks = result.landmarks[0] ?? null
            const category = result.handednesses?.[0]?.[0]

            const fps = fpsWindowRef.current
            if (!fps.startedAt) fps.startedAt = now
            fps.frames += 1
            if (now - fps.startedAt >= 1000) {
              fps.value = Math.round((fps.frames * 1000) / (now - fps.startedAt))
              fps.startedAt = now
              fps.frames = 0
            }

            processLandmarks(landmarks, category?.categoryName ?? '', category?.score ?? 0)
          } catch {
            setTrackingStatus('unavailable')
            stopLoop()
            stopStream()
            resetTracking()
            return
          }
        }
      }

      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)
  }, [processLandmarks, resetTracking, setTrackingStatus, stopLoop, stopStream])

  const startCamera = useCallback(async (retrying: boolean) => {
    if (statusRef.current === 'requesting' || statusRef.current === 'retrying' || statusRef.current === 'active') return
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setTrackingStatus('unsupported')
      return
    }

    requestTokenRef.current += 1
    const token = requestTokenRef.current
    stopLoop()
    stopStream()
    resetTracking()
    setTrackingStatus(retrying ? 'retrying' : 'requesting')

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      if (!mountedRef.current || token !== requestTokenRef.current) {
        stopLiveTracks(stream)
        return
      }

      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable')
      video.srcObject = stream
      await video.play()
      await ensureLandmarker()

      if (!mountedRef.current || token !== requestTokenRef.current) {
        stopStream()
        return
      }

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (token === requestTokenRef.current && statusRef.current === 'active') {
          setTrackingStatus('unavailable')
          stopLoop()
          stopStream()
          resetTracking()
        }
      }, { once: true })

      setDebug((current) => ({ ...current, delegate: delegateRef.current }))
      setTrackingStatus('active')
      startLoop()
    } catch (error) {
      stopLiveTracks(stream)
      if (streamRef.current === stream) stopStream()
      if (!mountedRef.current || token !== requestTokenRef.current) return
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setTrackingStatus(denied ? 'permission-denied' : 'unavailable')
      resetTracking()
    }
  }, [ensureLandmarker, resetTracking, setTrackingStatus, startLoop, stopLoop, stopStream])

  const enableCamera = useCallback(() => startCamera(false), [startCamera])
  const retryCamera = useCallback(() => startCamera(true), [startCamera])
  const disableCamera = useCallback(() => {
    requestTokenRef.current += 1
    stopLoop()
    stopStream()
    resetTracking()
    setTrackingStatus('not-started')
  }, [resetTracking, setTrackingStatus, stopLoop, stopStream])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) stopLoop()
      else if (statusRef.current === 'active') startLoop()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [startLoop, stopLoop])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestTokenRef.current += 1
      stopLoop()
      stopStream()
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [stopLoop, stopStream])

  return {
    videoRef,
    status,
    cursor,
    gestureEvent,
    pinchEvent,
    debug,
    enableCamera,
    retryCamera,
    disableCamera,
  }
}
