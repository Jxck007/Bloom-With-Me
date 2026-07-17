import { forwardRef, type ImgHTMLAttributes } from 'react'

interface AssetImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
}

export const AssetImage = forwardRef<HTMLImageElement, AssetImageProps>(function AssetImage(
  { draggable = false, onDragStart, onError, ...props },
  ref,
) {
  return (
    <img
      {...props}
      ref={ref}
      draggable={draggable}
      onDragStart={(event) => {
        event.preventDefault()
        onDragStart?.(event)
      }}
      onError={(event) => {
        console.error(`[Bloom asset] Failed to load image: ${props.src}`)
        event.currentTarget.style.visibility = 'hidden'
        onError?.(event)
      }}
    />
  )
})
