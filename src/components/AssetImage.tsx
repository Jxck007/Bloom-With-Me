import { forwardRef, type ImgHTMLAttributes } from 'react'

interface AssetImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
}

export const AssetImage = forwardRef<HTMLImageElement, AssetImageProps>(function AssetImage(
  { onError, ...props },
  ref,
) {
  return (
    <img
      {...props}
      ref={ref}
      onError={(event) => {
        console.error(`[Bloom asset] Failed to load image: ${props.src}`)
        event.currentTarget.style.visibility = 'hidden'
        onError?.(event)
      }}
    />
  )
})
