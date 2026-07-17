import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowerChoice } from '../data/flowers'
import { AssetImage } from './AssetImage'

const PRODUCTION_FLOWER_GROWTH_TOTAL_MS = 30_000
const developmentGrowthMs = Number(import.meta.env.VITE_FLOWER_GROWTH_TOTAL_MS)

export const FLOWER_GROWTH_TOTAL_MS = import.meta.env.DEV && Number.isFinite(developmentGrowthMs) && developmentGrowthMs >= 600
  ? developmentGrowthMs
  : PRODUCTION_FLOWER_GROWTH_TOTAL_MS

// Six deliberately unhurried story beats totalling 30 seconds in production.
const STAGE_WEIGHTS = [4_700, 4_700, 4_700, 5_100, 5_200, 5_600] as const
const STAGE_DURATIONS_MS = STAGE_WEIGHTS.map((duration) => duration / PRODUCTION_FLOWER_GROWTH_TOTAL_MS * FLOWER_GROWTH_TOTAL_MS)

interface FlowerGrowthSequenceProps {
  flower: FlowerChoice
  frames: string[]
  active: boolean
  onComplete: () => void
}

export function FlowerGrowthSequence({ flower, frames, active, onComplete }: FlowerGrowthSequenceProps) {
  const [ready, setReady] = useState(false)
  const [stage, setStage] = useState(0)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const sixFrames = useMemo(() => frames.slice(0, 6), [frames])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setStage(0)
    completedRef.current = false

    Promise.all(sixFrames.map((src) => new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => resolve()
      image.src = src
    }))).then(() => {
      if (!cancelled) setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [flower.id, sixFrames])

  useEffect(() => {
    if (!active || !ready) return

    const timers: number[] = []
    let elapsed = 0
    STAGE_DURATIONS_MS.forEach((duration, index) => {
      elapsed += duration
      if (index < sixFrames.length - 1) {
        timers.push(window.setTimeout(() => setStage(index + 1), elapsed))
      }
    })
    timers.push(window.setTimeout(() => {
      if (completedRef.current) return
      completedRef.current = true
      onCompleteRef.current()
    }, FLOWER_GROWTH_TOTAL_MS))

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [active, ready, sixFrames.length])

  return (
    <figure
      className={`flower-growth flower-growth--${flower.id} ${ready ? 'is-ready' : ''} ${stage === sixFrames.length - 1 ? 'is-blooming' : ''}`}
      aria-label={`${flower.name} growth, stage ${stage + 1} of ${sixFrames.length}`}
    >
      <div className="flower-growth__soil" aria-hidden="true" />
      {sixFrames.map((src, index) => (
        <AssetImage
          key={src}
          className={`flower-growth__frame ${index === stage ? 'is-current' : ''} ${index === stage - 1 ? 'is-previous' : ''}`}
          src={src}
          alt={index === stage ? `${flower.name} growth stage ${index + 1} of ${sixFrames.length}` : ''}
          aria-hidden={index !== stage}
        />
      ))}
      <span className="flower-growth__magic" aria-hidden="true" />
    </figure>
  )
}
