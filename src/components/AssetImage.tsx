import { forwardRef, useEffect, useState, type ImgHTMLAttributes } from 'react'
import { runtimeAssetPath } from '../data/assets'

interface AssetImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
}

export const AssetImage = forwardRef<HTMLImageElement, AssetImageProps>(function AssetImage(
  { draggable = false, onDragStart, onError, src, ...props },
  ref,
) {
  const preferredSource = runtimeAssetPath(src)
  const [activeSource, setActiveSource] = useState(preferredSource)

  useEffect(() => {
    setActiveSource(preferredSource)
  }, [preferredSource])

  return (
    <img
      {...props}
      src={activeSource}
      ref={ref}
      draggable={draggable}
      onDragStart={(event) => {
        event.preventDefault()
        onDragStart?.(event)
      }}
      onError={(event) => {
        if (activeSource !== src) {
          event.currentTarget.src = src
          setActiveSource(src)
          return
        }
        console.error(`[Bloom asset] Failed to load image: ${src}`)
        event.currentTarget.style.visibility = 'hidden'
        onError?.(event)
      }}
    />
  )
})
