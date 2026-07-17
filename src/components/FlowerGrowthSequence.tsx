import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowerChoice } from '../data/flowers'
import { AssetImage } from './AssetImage'

interface FlowerGrowthSequenceProps {
  flower: FlowerChoice
  frames: string[]
  stage: number
  active: boolean
  paused?: boolean
}

export function FlowerGrowthSequence({ flower, frames, stage, active, paused = false }: FlowerGrowthSequenceProps) {
  const sixFrames = useMemo(() => frames.slice(0, 6), [frames])
  const safeStage = Math.max(0, Math.min(sixFrames.length - 1, stage))
  const previousStageRef = useRef(safeStage)
  const [previousStage, setPreviousStage] = useState<number | null>(null)

  useEffect(() => {
    if (previousStageRef.current !== safeStage) {
      setPreviousStage(previousStageRef.current)
      previousStageRef.current = safeStage
      const timer = window.setTimeout(() => setPreviousStage(null), 820)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [safeStage])

  useEffect(() => {
    if (!active || paused) return
    const next = sixFrames[safeStage + 1]
    if (!next) return
    const image = new Image()
    image.decoding = 'async'
    image.src = next
  }, [active, paused, safeStage, sixFrames])

  const current = sixFrames[safeStage]
  const previous = previousStage === null ? null : sixFrames[previousStage]

  return (
    <figure
      className={`flower-growth flower-growth--${flower.id} flower-growth--stage-${safeStage} is-ready ${safeStage === sixFrames.length - 1 ? 'is-blooming' : ''}`}
      aria-label={`${flower.name} growth, stage ${safeStage + 1} of ${sixFrames.length}`}
    >
      {previous && previous !== current && (
        <AssetImage
          key={`previous-${previous}`}
          className="flower-growth__frame is-previous"
          src={previous}
          alt=""
          aria-hidden="true"
          decoding="async"
        />
      )}
      {current && (
        <AssetImage
          key={`current-${current}`}
          className="flower-growth__frame is-current"
          src={current}
          alt={`${flower.name} growth stage ${safeStage + 1} of ${sixFrames.length}`}
          decoding="async"
        />
      )}
      <span className="flower-growth__magic" aria-hidden="true" />
    </figure>
  )
}
