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
  gate: VocalGateState
  lastEncouragementAt: number
  lastMeterUpdateAt: number
  feedbackIndex: number
}

const VOICE_PROMPTS = ['Say Bloom', 'Say Grow', 'Hello Flower!', 'Keep Talking!', 'Wonderful!'] as const
const VOICE_REWARDS = ['🌱 Good!', '🌼 Growing...'] as const

function stopLiveTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop()
  })
}

function disposeSession(session: VoiceSession) {
  session.active = false
  if (session.frame !== null) cancelAnimationFrame(session.frame)
  if (session.recognitionRestartTimer !== null) window.clearTimeout(session.recognitionRestartTimer)
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

export function useVoiceTrigger(onTrigger: () => void, onReward?: () => void) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [level, setLevel] = useState(0)
  const [soundProgress, setSoundProgress] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('Tap the microphone')
  const [speechSupported, setSpeechSupported] = useState(() => speechRecognitionSupported(window))
  const sessionRef = useRef<VoiceSession | null>(null)
  const completionTimerRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)
  const triggeredRef = useRef(false)

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
  }, [])

  const cleanupSession = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) disposeSession(session)
  }, [])

  const stop = useCallback(() => {
    clearCompletionTimer()
    cleanupSession()
    triggeredRef.current = false
    setStatus('idle')
    setLevel(0)
    setSoundProgress(0)
    setTranscript('')
    setFeedback('Tap the microphone')
  }, [cleanupSession, clearCompletionTimer])

  const complete = useCallback((source: 'speech' | 'sound') => {
    const now = performance.now()
    if (triggeredRef.current || now < cooldownUntilRef.current) return
    triggeredRef.current = true
    cooldownUntilRef.current = now + VOICE_COOLDOWN_MS
    setStatus('heard')
    setSoundProgress(1)
    setFeedback(source === 'speech' ? '🌱 Good!' : '🌼 Growing...')
    onReward?.()
    cleanupSession()
    clearCompletionTimer()
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      onTrigger()
    }, 520)
  }, [cleanupSession, clearCompletionTimer, onReward, onTrigger])

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
    if (sessionRef.current?.active || triggeredRef.current) return
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
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = navigator.language || 'en-IN'
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
          if (!session.analyser && (hasFinalResult || normalized.length >= 3 || matchesGrowthPhrase(normalized))) complete('speech')
          else if (session.gate.progress > 0) setFeedback(VOICE_REWARDS[Math.min(VOICE_REWARDS.length - 1, Math.floor(session.gate.progress * 2))])
          else setFeedback(hasFinalResult ? 'Wonderful!' : 'Keep Talking!')
        }
        recognition.onnomatch = () => {
          if (session.active && !triggeredRef.current) setFeedback('Try again')
        }
        recognition.onerror = (event) => {
          if (!session.active || triggeredRef.current) return
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setSpeechSupported(false)
            setFeedback('Voice is not available here')
          } else if (event.error === 'no-speech') {
            setFeedback('Try again')
          }
        }
        recognition.onend = () => {
          if (!session.active || triggeredRef.current) return
          if (session.recognitionStarts >= 2) {
            setFeedback('Try again')
            return
          }
          session.recognitionRestartTimer = window.setTimeout(() => {
            if (!session.active || triggeredRef.current) return
            try {
              session.recognitionStarts += 1
              recognition.start()
            } catch {
              setSpeechSupported(false)
              setFeedback('Voice is not available here')
            }
          }, 250)
        }
        try {
          session.recognitionStarts = 1
          recognition.start()
        } catch {
          setSpeechSupported(false)
          setFeedback('Voice is not available here')
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

          // Keep audio analysis responsive while limiting React updates to about 20 Hz.
          if (now - session.lastMeterUpdateAt >= 50) {
            session.lastMeterUpdateAt = now
            const meterRange = Math.max(0.02, session.gate.threshold)
            setLevel(Math.min(1, session.gate.smoothedRms / meterRange))
            setSoundProgress(session.gate.progress)

            if (session.gate.calibrated) {
              setStatus('listening')
              if (session.gate.progress > 0) setFeedback(session.gate.progress > 0.58 ? '🌼 Growing...' : '🌱 Good!')
              else if (now - session.lastEncouragementAt > 5000) {
                session.lastEncouragementAt = now
                session.feedbackIndex = (session.feedbackIndex + 1) % VOICE_PROMPTS.length
                setFeedback(VOICE_PROMPTS[session.feedbackIndex])
              } else {
                setFeedback((current) => current === 'Voice is not available here' ? current : VOICE_PROMPTS[session.feedbackIndex])
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

  useEffect(() => stop, [stop])

  return {
    status,
    level,
    soundProgress,
    transcript,
    feedback,
    speechSupported,
    start,
    stop,
    recalibrate,
  }
}
