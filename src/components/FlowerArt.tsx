import type { FlowerChoice } from '../data/flowers'

interface FlowerArtProps {
  flower: FlowerChoice
  frames: string[]
  grown?: boolean
  compact?: boolean
}

export function FlowerArt({ flower, frames, grown = false, compact = false }: FlowerArtProps) {
  const frame = frames[grown ? frames.length - 1 : 0]
  return (
    <figure
      className={`flower-art ${grown ? 'flower-art--grown' : ''} ${compact ? 'flower-art--compact' : ''}`}
    >
      <img className="flower-art__image" src={frame} alt={`${flower.name} flower`} />
    </figure>
  )
}
