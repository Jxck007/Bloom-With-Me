import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceVocalGate,
  initialVocalGateState,
  matchesGrowthPhrase,
  normalizeTranscript,
  speechRecognitionSupported,
  VOICE_COOLDOWN_MS,
  type VocalGateState,
} from '../voice/voiceMath'
import { permissionFailure } from '../media/permissionState'

export type VoiceStatus = 'idle' | 'starting' | 'calibrating' | 'listening' | 'heard' | 'denied' | 'unavailable'

interface SpeechAlternativeLike { transcript: string; confidence?: number }
interface SpeechResultLike { [index: number]: SpeechAlternativeLike; length: number; isFinal?: boolean }
interface SpeechRecognitionEventLike extends Event {
  resultIndex?: number
  results: { [index: number]: SpeechResultLike; length: number }
}
interface SpeechRecognitionErrorEventLike extends Event { error?: string }
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onnomatch: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type AudioContextConstructor = new () => AudioContext

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    webkitAudioContext?: AudioContextConstructor
  }
}

type InputSource = 'speech' | 'sound' | 'touch'

interface VoiceSession {
  active: boolean
  stream: MediaStream | null
  audioContext: AudioContext | null
  source: MediaStreamAudioSourceNode | null
  analyser: AnalyserNode | null
  recognition: SpeechRecognitionLike | null
  frame: number | null
  recognitionRestartTimer: number | null
  recognitionStarts: number
  recognitionRunning: boolean
  gate: VocalGateState
  lastEncouragementAt: number
  lastMeterUpdateAt: number
  feedbackIndex: number
}

const VOICE_PROMPTS = ['Say Bloom', 'Say Grow', 'Hello Flower!', 'Keep Talking!', 'Wonderful!'] as const
const VOICE_REWARDS = ['🌱 Good!', '🌼 Growing...'] as const
const DEBUG = import.meta.env.DEV

function stopLiveTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop()
  })
}

function pauseSession(session: VoiceSession) {
  if (session.frame !== null) {
    cancelAnimationFrame(session.frame)
    session.frame = null
  }
  if (session.recognitionRestartTimer !== null) {
    window.clearTimeout(session.recognitionRestartTimer)
    session.recognitionRestartTimer = null
  }
  if (session.recognition && session.recognitionRunning) {
    try { session.recognition.stop() } catch { /* ignore */ }
    session.recognitionRunning = false
  }
}

function disposeSession(session: VoiceSession) {
  session.active = false
  pauseSession(session)
  if (session.recognition) {
    session.recognition.onresult = null
    session.recognition.onerror = null
    session.recognition.onend = null
    session.recognition.onnomatch = null
    try { session.recognition.abort() } catch { /* already stopped */ }
  }
  try { session.source?.disconnect() } catch { /* already disconnected */ }
  try { session.analyser?.disconnect() } catch { /* already disconnected */ }
  stopLiveTracks(session.stream)
  if (session.audioContext && session.audioContext.state !== 'closed') void session.audioContext.close()
}

function resetSessionGate(session: VoiceSession, now: number) {
  session.gate = {
    ...session.gate,
    progress: 0,
    triggered: false,
    loudSince: null,
    lastUpdatedAt: now,
  }
}

export function useVoiceTrigger(onTrigger: () => void, onReward?: () => void) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [level, setLevel] = useState(0)
  const [soundProgress, setSoundProgress] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('Tap the microphone')
  const [speechSupported, setSpeechSupported] = useState(() => speechRecognitionSupported(window))
  const [diagnostics, setDiagnostics] = useState<Record<string, string | number>>({})
  const sessionRef = useRef<VoiceSession | null>(null)
  const completionTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const triggeredRef = useRef(false)
  const liveRestartTimerRef = useRef<number | null>(null)

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
  }, [])

  const clearRestartTimer = useCallback(() => {
    if (liveRestartTimerRef.current !== null) {
      window.clearTimeout(liveRestartTimerRef.current)
      liveRestartTimerRef.current = null
    }
  }, [])

  const cleanupSession = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) disposeSession(session)
    clearRestartTimer()
  }, [clearRestartTimer])

  const restartSession = useCallback((permittedStream?: MediaStream | null) => {
    const session = sessionRef.current
    if (!session || !session.active || triggeredRef.current) return
    if (session.audioContext?.state === 'suspended') {
      void session.audioContext.resume()
    }
    if (session.recognition && !session.recognitionRunning) {
      try {
        session.recognition.start()
        session.recognitionRunning = true
      } catch {
        setSpeechSupported(false)
        setFeedback('Microphone unavailable')
      }
    }
    resetSessionGate(session, performance.now())
    setStatus('listening')
    setSoundProgress(0)
    setFeedback('Say Grow or make a gentle sound.')
    if (DEBUG && session.stream) {
      setDiagnostics((prev) => ({ ...prev, restartedAt: performance.now().toFixed(0) }))
    }
  }, [setSpeechSupported, setFeedback])

  const stop = useCallback(() => {
    clearCompletionTimer()
    cleanupSession()
    triggeredRef.current = false
    setStatus('idle')
    setLevel(0)
    setSoundProgress(0)
    setTranscript('')
    setFeedback('Tap the microphone')
    if (DEBUG) setDiagnostics({})
  }, [cleanupSession, clearCompletionTimer])

  const complete = useCallback((source: InputSource) => {
    const now = performance.now()
    if (triggeredRef.current || now < cooldownUntilRef.current) return
    triggeredRef.current = true
    cooldownUntilRef.current = now + VOICE_COOLDOWN_MS
    setStatus('heard')
    setSoundProgress(1)
    setFeedback(source === 'speech' ? 'Great! The flower is growing.' : 'Great! The flower is growing.')
    onReward?.()

    clearRestartTimer()
    cleanupSession()
    triggeredRef.current = true

    clearCompletionTimer()
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      onTrigger()
      triggeredRef.current = false
    }, 520)
  }, [clearCompletionTimer, clearRestartTimer, cleanupSession, onReward, onTrigger])

  const recalibrate = useCallback(() => {
    const session = sessionRef.current
    if (!session?.active || !session.analyser) return
    session.gate = initialVocalGateState(performance.now())
    session.lastEncouragementAt = performance.now()
    setStatus('calibrating')
    setLevel(0)
    setSoundProgress(0)
    setFeedback('Listening')
  }, [])

  const start = useCallback(async (permittedStream?: MediaStream | null) => {
    const now = performance.now()
    if (sessionRef.current?.active) return
    if (triggeredRef.current && now < cooldownUntilRef.current) return
    clearCompletionTimer()
    cleanupSession()
    triggeredRef.current = false
    setTranscript('')
    setLevel(0)
    setSoundProgress(0)
    setStatus('starting')
    setFeedback('Listening')

    if (permittedStream === undefined && !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      setFeedback('Voice is not available here')
      return
    }

    const session: VoiceSession = {
      active: true,
      stream: null,
      audioContext: null,
      source: null,
      analyser: null,
      recognition: null,
      frame: null,
      recognitionRestartTimer: null,
      recognitionStarts: 0,
      recognitionRunning: false,
      gate: initialVocalGateState(performance.now()),
      lastEncouragementAt: performance.now(),
      lastMeterUpdateAt: 0,
      feedbackIndex: 0,
    }
    sessionRef.current = session

    try {
      const permittedTrack = permittedStream?.getAudioTracks().find((track) => track.readyState === 'live')
      if (permittedStream !== undefined && !permittedTrack) {
        cleanupSession()
        setStatus('unavailable')
        setFeedback('Voice is not available here')
        return
      }
      const stream = permittedTrack
        ? new MediaStream([permittedTrack.clone()])
        : await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
      if (!session.active || sessionRef.current !== session) {
        stopLiveTracks(stream)
        return
      }
      session.stream = stream

      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      if (AudioContextClass) {
        const audioContext = new AudioContextClass()
        session.audioContext = audioContext
        await audioContext.resume()
        if (!session.active) return
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.68
        source.connect(analyser)
        session.source = source
        session.analyser = analyser
      }

      const SpeechRecognitionClass = window.SpeechRecognition ?? window.webkitSpeechRecognition
      setSpeechSupported(speechRecognitionSupported(window))
      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass()
        session.recognition = recognition
        session.recognitionRunning = false
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = navigator.language || 'en-IN'

        const startRecognition = () => {
          if (!session.active || session.recognitionRunning) return
          try {
            recognition.start()
            session.recognitionRunning = true
            if (DEBUG) setDiagnostics((prev) => ({ ...prev, recognition: 'started' }))
          } catch {
            session.recognitionRunning = false
            setSpeechSupported(false)
            setFeedback('Microphone unavailable')
          }
        }

        const stopRecognition = () => {
          if (!session.recognitionRunning) return
          try {
            recognition.stop()
          } catch { /* ignore */ }
          session.recognitionRunning = false
        }

        recognition.onresult = (event) => {
          if (!session.active || triggeredRef.current) return
          const pieces: string[] = []
          let hasFinalResult = false
          for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
            const result = event.results[index]
            const value = result?.[0]?.transcript
            if (value) pieces.push(value)
            if (result?.isFinal) hasFinalResult = true
          }
          const normalized = normalizeTranscript(pieces.join(' '))
          if (!normalized) return
          setTranscript(normalized.slice(-72))
          if (!session.analyser && (hasFinalResult || normalized.length >= 3 || matchesGrowthPhrase(normalized))) {
            complete('speech')
          } else if (session.gate.progress > 0) {
            setFeedback(VOICE_REWARDS[Math.min(VOICE_REWARDS.length - 1, Math.floor(session.gate.progress * 2))])
          } else {
            setFeedback(hasFinalResult ? 'I can hear you…' : 'Keep going…')
          }
        }
        recognition.onnomatch = () => {
          if (session.active && !triggeredRef.current) setFeedback('Try again')
        }
        recognition.onerror = (event) => {
          if (!session.active || triggeredRef.current) return
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setSpeechSupported(false)
            setFeedback('Microphone unavailable')
            stopRecognition()
          } else if (event.error === 'no-speech') {
            setFeedback('Try again')
            stopRecognition()
            liveRestartTimerRef.current = window.setTimeout(() => {
              if (!session.active || triggeredRef.current) return
              startRecognition()
            }, 400)
          } else {
            setFeedback('Try again')
            stopRecognition()
          }
        }
        recognition.onend = () => {
          session.recognitionRunning = false
          if (!session.active || triggeredRef.current) return
          if (session.recognitionStarts >= 2) {
            setFeedback('Try again')
            return
          }
          liveRestartTimerRef.current = window.setTimeout(() => {
            if (!session.active || triggeredRef.current) return
            session.recognitionStarts += 1
            startRecognition()
          }, 250)
        }

        try {
          session.recognitionStarts = 1
          startRecognition()
        } catch {
          setSpeechSupported(false)
          setFeedback('Microphone unavailable')
        }
      }

      if (!session.analyser && !SpeechRecognitionClass) {
        cleanupSession()
        setStatus('unavailable')
        setFeedback('Voice is not available here')
        return
      }

      if (session.analyser) {
        setStatus('calibrating')
        setFeedback('Listening')
        const samples = new Float32Array(session.analyser.fftSize)
        const analyse = () => {
          if (!session.active || !session.analyser || triggeredRef.current) return
          session.analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) sum += sample * sample
          const rms = Math.sqrt(sum / samples.length)
          const now = performance.now()
          session.gate = advanceVocalGate(session.gate, rms, now)

          if (now - session.lastMeterUpdateAt >= 50) {
            session.lastMeterUpdateAt = now
            const meterRange = Math.max(0.02, session.gate.threshold)
            setLevel(Math.min(1, session.gate.smoothedRms / meterRange))
            setSoundProgress(session.gate.progress)
            if (DEBUG) {
              setDiagnostics({
                stage: 'grow',
                rms: rms.toFixed(4),
                baseline: session.gate.baseline.toFixed(4),
                threshold: session.gate.threshold.toFixed(4),
                progress: session.gate.progress.toFixed(3),
                audioState: session.audioContext?.state ?? 'unknown',
                track: session.stream?.getAudioTracks()[0]?.readyState ?? 'none',
                recognition: session.recognitionRunning ? 'running' : 'stopped',
              })
            }
            if (session.gate.calibrated) {
              setStatus('listening')
              if (session.gate.progress > 0) setFeedback(session.gate.progress > 0.58 ? 'Keep going…' : 'I can hear you…')
              else if (now - session.lastEncouragementAt > 5000) {
                session.lastEncouragementAt = now
                session.feedbackIndex = (session.feedbackIndex + 1) % VOICE_PROMPTS.length
                setFeedback(VOICE_PROMPTS[session.feedbackIndex])
              } else {
                setFeedback((current) => current === 'Microphone unavailable' ? current : VOICE_PROMPTS[session.feedbackIndex])
              }
            }
          }
          if (session.gate.triggered) {
            complete('sound')
            return
          }
          session.frame = requestAnimationFrame(analyse)
        }
        session.frame = requestAnimationFrame(analyse)
      } else {
        setStatus('listening')
        setFeedback('Listening')
      }
    } catch (error) {
      if (sessionRef.current === session) cleanupSession()
      const failure = permissionFailure(error)
      setStatus(failure === 'denied' ? 'denied' : 'unavailable')
      setFeedback(failure === 'denied' ? 'Try again' : 'Voice is not available here')
    }
  }, [cleanupSession, clearCompletionTimer, complete])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return {
    status,
    level,
    soundProgress,
    transcript,
    feedback,
    speechSupported,
    diagnostics: DEBUG ? diagnostics : undefined,
    start,
    beginListening: start,
    stop,
    recalibrate,
    cooldownRemaining: Math.max(0, cooldownUntilRef.current - performance.now()),
  }
}
