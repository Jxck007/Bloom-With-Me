import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioCue =
  | 'button-tap'
  | 'seed-pickup'
  | 'seed-drop'
  | 'sunlight'
  | 'rain'
  | 'sprout'
  | 'voice-grow'
  | 'flower-bloom'
  | 'final-garden'

type AudioContextConstructor = new () => AudioContext

declare global {
  interface Window { webkitAudioContext?: AudioContextConstructor }
}

interface ManagedSource {
  source: AudioScheduledSourceNode
  nodes: AudioNode[]
}

export function useAudioManager() {
  const [muted, setMuted] = useState(true)
  const contextRef = useRef<AudioContext | null>(null)
  const activeRef = useRef(new Set<ManagedSource>())

  const stopActive = useCallback(() => {
    for (const managed of activeRef.current) {
      try { managed.source.stop() } catch { /* source already ended */ }
      managed.nodes.forEach((node) => {
        try { node.disconnect() } catch { /* already disconnected */ }
      })
    }
    activeRef.current.clear()
  }, [])

  const ensureContext = useCallback(async () => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextClass) return null
      contextRef.current = new AudioContextClass()
    }
    if (contextRef.current.state === 'suspended') await contextRef.current.resume()
    return contextRef.current
  }, [])

  const register = useCallback((source: AudioScheduledSourceNode, nodes: AudioNode[]) => {
    const managed = { source, nodes }
    activeRef.current.add(managed)
    source.addEventListener('ended', () => {
      activeRef.current.delete(managed)
      nodes.forEach((node) => {
        try { node.disconnect() } catch { /* already disconnected */ }
      })
    }, { once: true })
  }, [])

  const tone = useCallback((context: AudioContext, frequency: number, start: number, duration: number, volume = 0.026, type: OscillatorType = 'sine') => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.06, duration * 0.25))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    register(oscillator, [oscillator, gain])
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }, [register])

  const rainNoise = useCallback((context: AudioContext, start: number) => {
    const duration = 0.65
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * 0.18
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1500, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.022, start + 0.12)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    register(source, [source, filter, gain])
    source.start(start)
    source.stop(start + duration + 0.02)
  }, [register])

  const playWithContext = useCallback((context: AudioContext, cue: AudioCue) => {
    stopActive()
    const now = context.currentTime + 0.015
    if (cue === 'button-tap') tone(context, 520, now, 0.12, 0.018)
    if (cue === 'seed-pickup') tone(context, 420, now, 0.18, 0.02)
    if (cue === 'seed-drop') tone(context, 330, now, 0.24, 0.024, 'triangle')
    if (cue === 'sunlight') {
      tone(context, 523.25, now, 0.42, 0.022)
      tone(context, 659.25, now + 0.12, 0.46, 0.02)
    }
    if (cue === 'rain') rainNoise(context, now)
    if (cue === 'sprout') {
      tone(context, 392, now, 0.28, 0.02)
      tone(context, 523.25, now + 0.15, 0.34, 0.022)
    }
    if (cue === 'voice-grow') {
      tone(context, 760, now, 0.09, 0.024, 'triangle')
      tone(context, 523.25, now + 0.1, 0.38, 0.02)
      tone(context, 659.25, now + 0.2, 0.42, 0.018)
    }
    if (cue === 'flower-bloom') {
      tone(context, 523.25, now, 0.5, 0.02)
      tone(context, 659.25, now + 0.1, 0.55, 0.018)
      tone(context, 783.99, now + 0.2, 0.58, 0.016)
    }
    if (cue === 'final-garden') {
      tone(context, 392, now, 0.62, 0.018)
      tone(context, 523.25, now + 0.16, 0.7, 0.018)
      tone(context, 659.25, now + 0.32, 0.76, 0.016)
    }
  }, [rainNoise, stopActive, tone])

  const play = useCallback(async (cue: AudioCue) => {
    if (muted) return
    const context = await ensureContext()
    if (context) playWithContext(context, cue)
  }, [ensureContext, muted, playWithContext])

  const toggleMuted = useCallback(async () => {
    if (muted) {
      const context = await ensureContext()
      setMuted(false)
      if (context) playWithContext(context, 'button-tap')
    } else {
      setMuted(true)
      stopActive()
    }
  }, [ensureContext, muted, playWithContext, stopActive])

  useEffect(() => () => {
    stopActive()
    const context = contextRef.current
    contextRef.current = null
    if (context && context.state !== 'closed') void context.close()
  }, [stopActive])

  return { muted, play, toggleMuted, stop: stopActive }
}
