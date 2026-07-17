import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowerChoice } from '../data/flowers'
import { AssetImage } from './AssetImage'

const PRODUCTION_FLOWER_GROWTH_TOTAL_MS = 15_000
const developmentGrowthMs = Number(import.meta.env.VITE_FLOWER_GROWTH_TOTAL_MS)

export const FLOWER_GROWTH_TOTAL_MS = import.meta.env.DEV && Number.isFinite(developmentGrowthMs) && developmentGrowthMs >= 600
  ? developmentGrowthMs
  : PRODUCTION_FLOWER_GROWTH_TOTAL_MS

// Six deliberately unhurried story beats totalling 15 seconds in production.
const STAGE_WEIGHTS = [4_700, 4_700, 4_700, 5_100, 5_200, 5_600] as const
const STAGE_DURATIONS_MS = STAGE_WEIGHTS.map((duration) => duration / 30_000 * FLOWER_GROWTH_TOTAL_MS)

interface FlowerGrowthSequenceProps {
  flower: FlowerChoice
  frames: string[]
  active: boolean
  paused?: boolean
  onComplete: () => void
}

export function FlowerGrowthSequence({ flower, frames, active, paused = false, onComplete }: FlowerGrowthSequenceProps) {
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
    if (!active || !ready || paused || completedRef.current) return

    const timer = window.setTimeout(() => {
      if (stage < sixFrames.length - 1) {
        setStage((current) => current + 1)
        return
      }
      if (completedRef.current) return
      completedRef.current = true
      onCompleteRef.current()
    }, STAGE_DURATIONS_MS[stage] ?? 0)

    return () => window.clearTimeout(timer)
  }, [active, paused, ready, sixFrames.length, stage])

  return (
    <figure
      className={`flower-growth flower-growth--${flower.id} flower-growth--stage-${stage} ${ready ? 'is-ready' : ''} ${stage === sixFrames.length - 1 ? 'is-blooming' : ''}`}
      aria-label={`${flower.name} growth, stage ${stage + 1} of ${sixFrames.length}`}
    >
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
