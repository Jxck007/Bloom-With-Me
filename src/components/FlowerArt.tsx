import type { FlowerChoice } from '../data/flowers'
import { AssetImage } from './AssetImage'

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
      className={`flower-art flower-art--${flower.id} ${grown ? 'flower-art--grown' : ''} ${compact ? 'flower-art--compact' : ''}`}
    >
      <AssetImage className="flower-art__image" src={frame} alt={`${flower.name} flower`} />
    </figure>
  )
}
