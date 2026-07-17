import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { AssetImage } from './AssetImage'

interface RainAssets {
  small: string
  medium: string
  large: string
}

interface LocalRainProps {
  sceneRef: RefObject<HTMLDivElement | null>
  cloudRef: RefObject<HTMLImageElement | null>
  potRef: RefObject<HTMLImageElement | null>
  assets: RainAssets
  active: boolean
  reducedMotion: boolean
}

interface RainZone {
  left: number
  top: number
  width: number
  height: number
}

interface Droplet {
  id: number
  src: string
  x: number
  width: number
  duration: number
  opacity: number
  delay: number
  drift: number
}

const EMPTY_ZONE: RainZone = { left: 0, top: 0, width: 0, height: 0 }

export function LocalRain({ sceneRef, cloudRef, potRef, assets, active, reducedMotion }: LocalRainProps) {
  const [zone, setZone] = useState<RainZone>(EMPTY_ZONE)
  const [drops, setDrops] = useState<Droplet[]>([])
  const nextIdRef = useRef(0)
  const spawnTimerRef = useRef<number | null>(null)
  const removalTimersRef = useRef(new Set<number>())
  const dropletAssets = useMemo(() => [assets.small, assets.medium, assets.large], [assets.large, assets.medium, assets.small])

  const recalculate = useCallback(() => {
    const scene = sceneRef.current?.getBoundingClientRect()
    const cloud = cloudRef.current?.getBoundingClientRect()
    const pot = potRef.current?.getBoundingClientRect()
    if (!scene || !cloud || !pot || cloud.width === 0 || pot.width === 0) return
    const width = cloud.width * 0.66
    const potCenter = pot.left + pot.width / 2 - scene.left
    const top = cloud.bottom - scene.top - Math.min(8, cloud.height * 0.04)
    const soilY = pot.top - scene.top + pot.height * 0.25
    setZone({
      left: potCenter - width / 2,
      top,
      width,
      height: Math.max(36, soilY - top),
    })
  }, [cloudRef, potRef, sceneRef])

  useEffect(() => {
    recalculate()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(recalculate)
    const observed: Array<Element | null> = [sceneRef.current, cloudRef.current, potRef.current]
    observed.forEach((element) => {
      if (element) observer?.observe(element)
    })
    window.addEventListener('resize', recalculate)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', recalculate)
    }
  }, [cloudRef, potRef, recalculate, sceneRef])

  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(recalculate)
    return () => cancelAnimationFrame(frame)
  }, [active, recalculate])

  useEffect(() => {
    if (!active || zone.width <= 0 || zone.height <= 0) return
    let cancelled = false

    const spawn = () => {
      if (cancelled) return
      const duration = reducedMotion ? 1_050 + Math.random() * 100 : 750 + Math.random() * 400
      const delay = reducedMotion ? Math.random() * 100 : Math.random() * 140
      const id = ++nextIdRef.current
      const drop: Droplet = {
        id,
        src: dropletAssets[Math.floor(Math.random() * dropletAssets.length)],
        x: Math.random(),
        width: reducedMotion ? 10 + Math.random() * 7 : Math.random() > 0.9 ? 21 + Math.random() * 4 : 9 + Math.random() * 12,
        duration,
        opacity: 0.62 + Math.random() * 0.28,
        delay,
        drift: reducedMotion ? 0 : -3 + Math.random() * 6,
      }
      setDrops((current) => [...current, drop])
      const removalTimer = window.setTimeout(() => {
        removalTimersRef.current.delete(removalTimer)
        setDrops((current) => current.filter((item) => item.id !== id))
      }, duration + delay + 80)
      removalTimersRef.current.add(removalTimer)
      spawnTimerRef.current = window.setTimeout(spawn, reducedMotion ? 300 + Math.random() * 120 : 110 + Math.random() * 80)
    }

    spawn()
    return () => {
      cancelled = true
      if (spawnTimerRef.current !== null) {
        window.clearTimeout(spawnTimerRef.current)
        spawnTimerRef.current = null
      }
    }
  }, [active, dropletAssets, reducedMotion, zone.height, zone.width])

  useEffect(() => () => {
    removalTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    removalTimersRef.current.clear()
  }, [])

  return (
    <div className="local-rain" aria-hidden="true" data-active={active || drops.length > 0}>
      {drops.map((drop) => (
        <AssetImage
          key={drop.id}
          className="local-rain__drop"
          src={drop.src}
          alt=""
          style={{
            left: zone.left + drop.x * zone.width - drop.width / 2,
            top: zone.top,
            width: drop.width,
            opacity: drop.opacity,
            '--drop-distance': `${zone.height}px`,
            '--drop-duration': `${drop.duration}ms`,
            '--drop-delay': `${drop.delay}ms`,
            '--drop-drift': `${drop.drift}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
