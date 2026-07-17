import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import type { AssetMap } from '../data/assets'
import type { FlowerChoice, FlowerId } from '../data/flowers'
import { FLOWERS } from '../data/flowers'
import type { GameStep } from '../game/gameState'
import type { GardenData } from '../game/gardenStorage'
import { GARDEN_SLOTS, slotWithOccupancy, type GardenSlot } from '../game/gardenSlots'
import { isInsidePotDropZone, resolveSeedDrop } from '../gesture/seedInteractionMath'
import type { CursorPoint, PinchEvent, PinchState } from '../hooks/useHandTracking'
import type { SeedInteractionDebug, SeedInteractionPhase } from '../types/interaction'
import { AssetImage } from './AssetImage'
import { FlowerGrowthSequence } from './FlowerGrowthSequence'
import { LocalRain } from './LocalRain'
import { SunRays } from './SunRays'

export type WeatherState = 'clear' | 'cloudEntering' | 'cloudy' | 'raining' | 'clearing'
type DragSource = 'hand' | 'pointer' | null
type DragKind = 'seed' | 'plant' | null

interface DragState {
  phase: SeedInteractionPhase
  kind: DragKind
  source: DragSource
  flower: FlowerChoice | null
  x: number
  y: number
  originX: number
  originY: number
  pointerId: number | null
}

interface GardenSceneProps {
  assets: AssetMap
  step: GameStep
  selected: FlowerChoice | null
  garden: GardenData
  onGardenPageChange?: (pageIndex: number) => void
  onSelectFlower?: (flower: FlowerChoice) => void
  onPlantSeed?: () => void
  onPlantFlower?: (slotIndex: number) => boolean
  onPlantRejected?: (reason: 'outside' | 'occupied') => void
  onSeedPickup?: () => void
  onSeedDrop?: () => void
  onInteractionDebug?: (debug: SeedInteractionDebug) => void
  onSunTap?: () => void
  onCloudTap?: () => void
  handCursor?: CursorPoint
  pinchEvent?: PinchEvent | null
  pinchState?: PinchState
  planted: boolean
  sunny: boolean
  sunExiting?: boolean
  watered: boolean
  growthStarted: boolean
  weatherState: WeatherState
  reducedMotion: boolean
  onGrowthComplete?: () => void
}

const idleDrag = (): DragState => ({
  phase: 'idle',
  kind: null,
  source: null,
  flower: null,
  x: 0,
  y: 0,
  originX: 0,
  originY: 0,
  pointerId: null,
})

export function GardenScene({
  assets,
  step,
  selected,
  garden,
  onGardenPageChange,
  onSelectFlower,
  onPlantSeed,
  onPlantFlower,
  onPlantRejected,
  onSeedPickup,
  onSeedDrop,
  onInteractionDebug,
  onSunTap,
  onCloudTap,
  handCursor = { x: 0.5, y: 0.5, visible: false },
  pinchEvent = null,
  pinchState = 'open',
  planted,
  sunny,
  sunExiting = false,
  watered,
  growthStarted,
  weatherState,
  reducedMotion,
  onGrowthComplete,
}: GardenSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const potRef = useRef<HTMLImageElement>(null)
  const normalCloudRef = useRef<HTMLImageElement>(null)
  const rainCloudRef = useRef<HTMLImageElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const looseSeedRef = useRef<HTMLButtonElement>(null)
  const grownPlantRef = useRef<HTMLButtonElement>(null)
  const packetRefs = useRef(new Map<FlowerId, HTMLButtonElement>())
  const dragRef = useRef<DragState>(idleDrag())
  const hoveredRef = useRef<FlowerChoice | null>(null)
  const lastPinchEventRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const returnTimerRef = useRef<number | null>(null)
  const selectionTimerRef = useRef<number | null>(null)
  const transitionFrameRef = useRef<number | null>(null)
  const swipeStartRef = useRef<number | null>(null)
  const cloudSwipeStartRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState>(dragRef.current)
  const [hovered, setHovered] = useState<FlowerChoice | null>(null)
  const [dropZoneOverlap, setDropZoneOverlap] = useState(false)
  const [selectionPending, setSelectionPending] = useState<FlowerId | null>(null)
  const [gridRevealed, setGridRevealed] = useState(false)
  const [keyboardPlantHeld, setKeyboardPlantHeld] = useState(false)

  const activePage = garden.pages[garden.activePageIndex]
  const occupiedSlots = useMemo(() => new Set(activePage.flowers.map((flower) => flower.slotIndex)), [activePage.flowers])
  const slots = useMemo(() => slotWithOccupancy(occupiedSlots), [occupiedSlots])
  const showGardenGrid = step === 'place' && gridRevealed
  const showCalibration = import.meta.env.DEV && new URLSearchParams(window.location.search).has('calibrateGarden')
  const showSun = step === 'sun'
  const showClouds = step === 'rain'
  const raining = weatherState === 'raining'
  const pot = watered ? assets.pots.watered : planted ? assets.pots.planted : assets.pots.empty
  const preloadSources = useMemo(() => {
    const flowerFrames = selected ? assets.flowers[selected.id] : []
    if (step === 'choose') return FLOWERS.flatMap((flower) => [assets.seeds[flower.id].packet, assets.seeds[flower.id].seed])
    if (step === 'plant') return [assets.pots.empty, assets.pots.planted, assets.weather.sun]
    if (step === 'sun') return [assets.weather.sun, assets.weather.cloudNormal]
    if (step === 'rain') return [assets.weather.cloudNormal, assets.weather.cloudRain, ...Object.values(assets.weather.droplets), assets.pots.watered, ...flowerFrames.slice(0, 2)]
    if (step === 'grow') return [assets.pots.watered, ...flowerFrames, assets.garden.plantingGrid]
    if (step === 'place') return [assets.garden.plantingGrid, flowerFrames[5]].filter((source): source is string => Boolean(source))
    return [assets.background, assets.foreground]
  }, [assets, selected, step])

  useEffect(() => {
    preloadSources.forEach((src) => {
      const image = new Image()
      image.onerror = () => console.error(`[Bloom asset] Failed to preload image: ${src}`)
      image.src = src
    })
  }, [preloadSources])

  const updateDrag = useCallback((next: DragState) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const updateHovered = useCallback((next: FlowerChoice | null) => {
    if (hoveredRef.current?.id === next?.id) return
    hoveredRef.current = next
    setHovered(next)
  }, [])

  const localPoint = useCallback((clientX: number, clientY: number) => {
    const bounds = sceneRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return { x: clientX - bounds.left, y: clientY - bounds.top }
  }, [])

  const handClientPoint = useCallback(() => {
    const bounds = sceneRef.current?.getBoundingClientRect()
    if (!bounds) return null
    return {
      clientX: bounds.left + handCursor.x * bounds.width,
      clientY: bounds.top + handCursor.y * bounds.height,
    }
  }, [handCursor.x, handCursor.y])

  const packetAtPoint = useCallback((clientX: number, clientY: number) => {
    for (const flower of FLOWERS) {
      const bounds = packetRefs.current.get(flower.id)?.getBoundingClientRect()
      if (bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) return flower
    }
    return null
  }, [])

  const looseSeedAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!selected || step !== 'plant') return null
    const bounds = looseSeedRef.current?.getBoundingClientRect()
    if (!bounds) return null
    return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom ? selected : null
  }, [selected, step])

  const grownPlantAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!selected || step !== 'place') return null
    const bounds = grownPlantRef.current?.getBoundingClientRect()
    if (!bounds) return null
    return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom ? selected : null
  }, [selected, step])

  const overlapsPot = useCallback((clientX: number, clientY: number) => {
    const bounds = potRef.current?.getBoundingClientRect()
    return isInsidePotDropZone(bounds ?? null, clientX, clientY)
  }, [])

  const slotAtPoint = useCallback((clientX: number, clientY: number): GardenSlot | null => {
    const bounds = gridRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0 || bounds.height === 0) return null
    let closest: GardenSlot | null = null
    let closestDistance = Number.POSITIVE_INFINITY
    for (const slot of GARDEN_SLOTS) {
      const centreX = bounds.left + bounds.width * slot.xPercent / 100
      const centreY = bounds.top + bounds.height * slot.yPercent / 100
      const normalX = (clientX - centreX) / (bounds.width * 0.072)
      const normalY = (clientY - centreY) / (bounds.height * 0.055)
      const distance = normalX * normalX + normalY * normalY
      if (distance <= 1 && distance < closestDistance) {
        closest = slot
        closestDistance = distance
      }
    }
    return closest
  }, [])

  const beginDrag = useCallback((kind: Exclude<DragKind, null>, flower: FlowerChoice, source: Exclude<DragSource, null>, clientX: number, clientY: number, pointerId: number | null) => {
    if (performance.now() < cooldownUntilRef.current || dragRef.current.flower) return
    const sourceBounds = kind === 'seed'
      ? looseSeedRef.current?.getBoundingClientRect()
      : grownPlantRef.current?.getBoundingClientRect()
    const sceneBounds = sceneRef.current?.getBoundingClientRect()
    if (!sourceBounds || !sceneBounds) return
    const point = localPoint(clientX, clientY)
    const next: DragState = {
      phase: source === 'hand' ? 'pinch-started' : 'seed-grabbed',
      kind,
      source,
      flower,
      x: point.x,
      y: point.y,
      originX: sourceBounds.left + sourceBounds.width / 2 - sceneBounds.left,
      originY: sourceBounds.top + sourceBounds.height / 2 - sceneBounds.top,
      pointerId,
    }
    updateDrag(next)
    updateHovered(flower)
    if (kind === 'seed') {
      setDropZoneOverlap(overlapsPot(clientX, clientY))
      onSeedPickup?.()
    } else {
      setGridRevealed(true)
      setKeyboardPlantHeld(false)
    }
    transitionFrameRef.current = requestAnimationFrame(() => {
      if (dragRef.current.flower?.id === flower.id && dragRef.current.kind === kind) {
        updateDrag({ ...dragRef.current, phase: 'seed-grabbed' })
      }
    })
  }, [localPoint, onSeedPickup, overlapsPot, updateDrag, updateHovered])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const current = dragRef.current
    if (!current.flower) return
    const point = localPoint(clientX, clientY)
    updateDrag({ ...current, phase: 'dragging', x: point.x, y: point.y })
    setDropZoneOverlap(current.kind === 'seed'
      ? overlapsPot(clientX, clientY)
      : Boolean(slotAtPoint(clientX, clientY)))
  }, [localPoint, overlapsPot, slotAtPoint, updateDrag])

  const returnDraggedItem = useCallback((reason?: 'outside' | 'occupied') => {
    const latest = dragRef.current
    updateDrag({ ...latest, phase: 'returned', x: latest.originX, y: latest.originY })
    setDropZoneOverlap(false)
    if (reason) onPlantRejected?.(reason)
    returnTimerRef.current = window.setTimeout(() => {
      updateDrag(idleDrag())
      updateHovered(null)
    }, 440)
  }, [onPlantRejected, updateDrag, updateHovered])

  const finishDrag = useCallback((clientX: number, clientY: number, lost = false) => {
    const current = dragRef.current
    if (!current.flower) return
    const point = localPoint(clientX, clientY)
    updateDrag({ ...current, phase: 'pinch-released', x: point.x, y: point.y })

    if (current.kind === 'seed') {
      const accepted = resolveSeedDrop(overlapsPot(clientX, clientY), lost) === 'planted'
      setDropZoneOverlap(accepted)
      onSeedDrop?.()
      if (!accepted) {
        requestAnimationFrame(() => returnDraggedItem())
        return
      }
      cooldownUntilRef.current = performance.now() + 700
      updateDrag({ ...current, phase: 'planted', x: point.x, y: point.y })
      onPlantSeed?.()
      return
    }

    const slot = lost ? null : slotAtPoint(clientX, clientY)
    if (!slot) {
      requestAnimationFrame(() => returnDraggedItem('outside'))
      return
    }
    if (occupiedSlots.has(slot.slotIndex)) {
      requestAnimationFrame(() => returnDraggedItem('occupied'))
      return
    }
    const accepted = onPlantFlower?.(slot.slotIndex) ?? false
    if (!accepted) {
      requestAnimationFrame(() => returnDraggedItem('occupied'))
      return
    }
    updateDrag({ ...current, phase: 'planted', x: point.x, y: point.y })
    setDropZoneOverlap(false)
    returnTimerRef.current = window.setTimeout(() => {
      updateDrag(idleDrag())
      updateHovered(null)
    }, reducedMotion ? 20 : 220)
  }, [localPoint, occupiedSlots, onPlantFlower, onPlantSeed, onSeedDrop, overlapsPot, reducedMotion, returnDraggedItem, slotAtPoint, updateDrag, updateHovered])

  const chooseFlower = useCallback((flower: FlowerChoice) => {
    if (selectionPending || step !== 'choose') return
    setSelectionPending(flower.id)
    updateHovered(flower)
    onSeedPickup?.()
    selectionTimerRef.current = window.setTimeout(() => {
      selectionTimerRef.current = null
      onSelectFlower?.(flower)
    }, 420)
  }, [onSeedPickup, onSelectFlower, selectionPending, step, updateHovered])

  useEffect(() => {
    if (step !== 'choose' && step !== 'plant' && step !== 'place') {
      if (dragRef.current.flower) updateDrag(idleDrag())
      if (hoveredRef.current) updateHovered(null)
      setDropZoneOverlap(false)
      return
    }
    if (!handCursor.visible) {
      if (!dragRef.current.flower) updateHovered(null)
      return
    }
    const point = handClientPoint()
    if (!point) return
    if (dragRef.current.source === 'hand' && dragRef.current.flower && pinchState === 'pinching') {
      moveDrag(point.clientX, point.clientY)
      return
    }
    if (dragRef.current.flower) return
    const next = step === 'choose'
      ? packetAtPoint(point.clientX, point.clientY)
      : step === 'plant'
        ? looseSeedAtPoint(point.clientX, point.clientY)
        : grownPlantAtPoint(point.clientX, point.clientY)
    updateHovered(next)
  }, [grownPlantAtPoint, handClientPoint, handCursor.visible, looseSeedAtPoint, moveDrag, packetAtPoint, pinchState, step, updateDrag, updateHovered])

  useEffect(() => {
    if (!pinchEvent || pinchEvent.id === lastPinchEventRef.current || !['choose', 'plant', 'place'].includes(step)) return
    lastPinchEventRef.current = pinchEvent.id
    const point = handClientPoint()
    if (!point) return
    if (pinchEvent.phase === 'start' && hoveredRef.current) {
      if (step === 'choose') chooseFlower(hoveredRef.current)
      if (step === 'plant' && !dragRef.current.flower) beginDrag('seed', hoveredRef.current, 'hand', point.clientX, point.clientY, null)
      if (step === 'place' && !dragRef.current.flower) beginDrag('plant', hoveredRef.current, 'hand', point.clientX, point.clientY, null)
    }
    if (pinchEvent.phase === 'release' && dragRef.current.source === 'hand') {
      finishDrag(point.clientX, point.clientY, pinchEvent.reason === 'lost')
    }
  }, [beginDrag, chooseFlower, finishDrag, handClientPoint, pinchEvent, step])

  useEffect(() => {
    if (step !== 'choose') setSelectionPending(null)
    if (step === 'choose' && dragRef.current.kind === 'plant') {
      updateDrag(idleDrag())
      updateHovered(null)
    }
    if (step !== 'place') {
      setGridRevealed(false)
      setKeyboardPlantHeld(false)
    }
  }, [step, updateDrag, updateHovered])

  useEffect(() => {
    onInteractionDebug?.({
      phase: drag.phase,
      hoveredPacket: step === 'choose' ? hovered?.id ?? null : null,
      grabbedSeed: drag.kind === 'seed' ? drag.flower?.id ?? null : null,
      dropZoneOverlap,
    })
  }, [drag.flower?.id, drag.kind, drag.phase, dropZoneOverlap, hovered?.id, onInteractionDebug, step])

  useEffect(() => () => {
    if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current)
    if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current)
    if (transitionFrameRef.current !== null) cancelAnimationFrame(transitionFrameRef.current)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, kind: Exclude<DragKind, null>, flower: FlowerChoice) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    beginDrag(kind, flower, 'pointer', event.clientX, event.clientY, event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.source !== 'pointer' || dragRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    moveDrag(event.clientX, event.clientY)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.source !== 'pointer' || dragRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    finishDrag(event.clientX, event.clientY)
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.source === 'pointer' && dragRef.current.pointerId === event.pointerId) finishDrag(event.clientX, event.clientY, true)
  }

  const onGridTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (showGardenGrid) swipeStartRef.current = event.changedTouches[0]?.clientX ?? null
  }

  const onGridTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (start === null || !showGardenGrid) return
    const delta = (event.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) < 45) return
    const next = garden.activePageIndex + (delta < 0 ? 1 : -1)
    if (next >= 0 && next < garden.pages.length) onGardenPageChange?.(next)
  }

  const placeFromKeyboard = (slotIndex: number) => {
    if (!keyboardPlantHeld || occupiedSlots.has(slotIndex)) return
    if (onPlantFlower?.(slotIndex)) setKeyboardPlantHeld(false)
  }

  return (
    <div
      ref={sceneRef}
      className={`garden-scene garden-scene--${step} garden-scene--interaction-${drag.phase} ${showGardenGrid ? 'garden-scene--placement' : 'garden-scene--nursery'} ${sunny ? 'garden-scene--sunny' : ''} ${raining ? 'garden-scene--raining' : ''}`}
      data-weather-state={weatherState}
      data-scene={showGardenGrid ? 'placement' : 'nursery'}
    >
      <AssetImage className="garden-scene__background" src={assets.background} alt="" width="1696" height="965" />

      {sunny && <div className="garden-sun-warmth" aria-hidden="true" />}
      {showSun && (
        <button className={`garden-weather-action garden-weather-action--sun ${sunny ? 'is-active' : ''} ${sunExiting ? 'is-exiting' : ''}`} type="button" onClick={onSunTap} aria-label="Tap the sun to warm the planted seed">
          <SunRays />
          <AssetImage className="garden-weather garden-weather--sun" src={assets.weather.sun} alt="" width="1188" height="1164" />
        </button>
      )}

      {showClouds && (
        <button
          className="garden-weather-action garden-weather-action--cloud"
          type="button"
          onClick={onCloudTap}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') cloudSwipeStartRef.current = event.clientX
          }}
          onPointerUp={(event) => {
            const start = cloudSwipeStartRef.current
            cloudSwipeStartRef.current = null
            if (event.pointerType === 'touch' && start !== null && Math.abs(event.clientX - start) >= 30) onCloudTap?.()
          }}
          onPointerCancel={() => { cloudSwipeStartRef.current = null }}
          disabled={weatherState !== 'cloudy'}
          aria-label="Tap or swipe the cloud to make rain"
        >
          <AssetImage ref={normalCloudRef} className="garden-weather garden-weather--cloud garden-weather--cloud-normal" src={assets.weather.cloudNormal} alt="" data-cloud="normal" width="1123" height="685" />
          <AssetImage ref={rainCloudRef} className="garden-weather garden-weather--cloud garden-weather--cloud-rain" src={assets.weather.cloudRain} alt="" data-cloud="rain" width="1117" height="662" />
        </button>
      )}

      {showClouds && (
        <LocalRain
          sceneRef={sceneRef}
          cloudRef={rainCloudRef}
          potRef={potRef}
          assets={assets.weather.droplets}
          active={weatherState === 'raining'}
          reducedMotion={reducedMotion}
        />
      )}

      {showGardenGrid && (
        <div
          ref={gridRef}
          className={`garden-grid ${step === 'place' ? 'garden-grid--revealed' : ''}`}
          aria-label={`Garden ${garden.activePageIndex + 1}, ${activePage.flowers.length} of 12 slots planted`}
          onTouchStart={onGridTouchStart}
          onTouchEnd={onGridTouchEnd}
        >
          <AssetImage className="garden-grid__base" src={assets.garden.plantingGrid} alt="Twelve planting spaces in three rows" draggable={false} width="1379" height="831" />
          {activePage.flowers.map((flower) => {
            const slot = GARDEN_SLOTS[flower.slotIndex]
            return (
              <div
                key={flower.id}
                className={`garden-plant garden-plant--${flower.flowerType} garden-plant--row-${slot.row}`}
                style={{
                  left: `${slot.xPercent}%`,
                  top: `${slot.yPercent}%`,
                  '--slot-scale': slot.scale,
                  zIndex: 12 + slot.row,
                } as CSSProperties}
              >
                <AssetImage src={assets.flowers[flower.flowerType][5]} alt={`${flower.flowerType} planted in garden slot ${flower.slotIndex + 1}`} draggable={false} />
              </div>
            )
          })}
          {step === 'place' && slots.map((slot) => slot.occupied ? (
            <span
              key={slot.slotIndex}
              className="garden-slot garden-slot--occupied"
              style={{ left: `${slot.xPercent}%`, top: `${slot.yPercent}%` }}
              aria-hidden="true"
            />
          ) : (
            <button
              key={slot.slotIndex}
              className="garden-slot garden-slot--empty"
              style={{ left: `${slot.xPercent}%`, top: `${slot.yPercent}%` }}
              type="button"
              aria-label={`Plant in empty garden slot ${slot.slotIndex + 1}`}
              onClick={() => placeFromKeyboard(slot.slotIndex)}
            />
          ))}
          {showCalibration && slots.map((slot) => (
            <span
              key={`calibration-${slot.slotIndex}`}
              className={`garden-slot-calibration ${slot.occupied ? 'is-occupied' : ''}`}
              style={{ left: `${slot.xPercent}%`, top: `${slot.yPercent}%` }}
              aria-hidden="true"
            >
              {slot.slotIndex + 1}
            </span>
          ))}
        </div>
      )}

      {showGardenGrid && (
        <nav className="garden-pagination" aria-label="Garden pages">
          <button type="button" onClick={() => onGardenPageChange?.(garden.activePageIndex - 1)} disabled={garden.activePageIndex === 0} aria-label="Previous garden">‹</button>
          <span>Garden {garden.activePageIndex + 1}</span>
          <button type="button" onClick={() => onGardenPageChange?.(garden.activePageIndex + 1)} disabled={garden.activePageIndex === garden.pages.length - 1} aria-label="Next garden">›</button>
        </nav>
      )}

      {step === 'choose' && onSelectFlower && (
        <div className={`garden-seed-options ${selectionPending ? 'is-exiting' : ''}`} role="group" aria-label="Choose a seed packet">
          {FLOWERS.map((flower) => (
            <button
              key={flower.id}
              ref={(element) => {
                if (element) packetRefs.current.set(flower.id, element)
                else packetRefs.current.delete(flower.id)
              }}
              className={`garden-seed-option garden-seed-option--${flower.id} ${hovered?.id === flower.id ? 'is-hovered' : ''} ${selectionPending === flower.id ? 'is-selected' : ''}`}
              type="button"
              aria-label={`Choose ${flower.name} seed packet`}
              onClick={() => chooseFlower(flower)}
            >
              <AssetImage src={assets.seeds[flower.id].packet} alt="" draggable={false} />
              <span>{flower.name}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'plant' && selected && (
        <button
          ref={looseSeedRef}
          className={`loose-seed-control ${hovered?.id === selected.id ? 'is-hovered' : ''} ${drag.kind === 'seed' ? 'is-grabbed' : ''}`}
          type="button"
          aria-label={`Drag the loose ${selected.name} seed into the pot`}
          onPointerDown={(event) => onPointerDown(event, 'seed', selected)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <AssetImage src={assets.seeds[selected.id].seed} alt={`${selected.name} seed`} draggable={false} />
        </button>
      )}

      {drag.flower && (
        <AssetImage
          className={`${drag.kind === 'plant' ? 'plant-drag-item' : 'seed-drag-item'} ${drag.kind === 'plant' ? `plant-drag-item--${drag.flower.id}` : ''} ${drag.kind === 'seed' ? `seed-drag-item--${drag.phase}` : ''}`}
          style={{ left: drag.x, top: drag.y }}
          src={drag.kind === 'plant' ? assets.flowers[drag.flower.id][5] : assets.seeds[drag.flower.id].seed}
          alt=""
          aria-hidden="true"
        />
      )}

      {step === 'plant' && <div className={`pot-drop-zone ${dropZoneOverlap ? 'is-overlapping' : ''}`} aria-hidden="true" />}

      {!['welcome', 'choose'].includes(step) && (
        <div className="pot-area">
          {selected && step === 'grow' && growthStarted && onGrowthComplete && (
            <div className="pot-growth-viewport">
              <FlowerGrowthSequence flower={selected} frames={assets.flowers[selected.id]} active onComplete={onGrowthComplete} />
            </div>
          )}

          {selected && step === 'place' && (
            <button
              ref={grownPlantRef}
              className={`grown-plant-control grown-plant-control--${selected.id} ${hovered?.id === selected.id ? 'is-hovered' : ''} ${drag.kind === 'plant' ? 'is-grabbed' : ''}`}
              type="button"
              aria-label={`${keyboardPlantHeld ? 'Flower picked up. Choose an empty garden slot.' : `Pick up the grown ${selected.name}`}`}
              aria-pressed={keyboardPlantHeld}
              onClick={(event) => {
                if (event.detail !== 0) return
                setGridRevealed(true)
                setKeyboardPlantHeld(true)
              }}
              onPointerDown={(event) => onPointerDown(event, 'plant', selected)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <AssetImage src={assets.flowers[selected.id][5]} alt={`Grown ${selected.name} ready to plant`} draggable={false} />
            </button>
          )}

          {(raining || weatherState === 'clearing') && (
            <span className="pot-soil-wet" aria-hidden="true"><i /><i /><i /></span>
          )}
          <AssetImage className="pot" ref={potRef} src={pot} alt={watered ? 'Watered flower pot' : planted ? 'Planted flower pot' : 'Empty flower pot'} />
        </div>
      )}

      {handCursor.visible && (
        <AssetImage className="butterfly-cursor butterfly-cursor--garden" style={{ left: `${handCursor.x * 100}%`, top: `${handCursor.y * 100}%` }} src={assets.gestures.cursor} alt="" aria-hidden="true" />
      )}

      <AssetImage className="garden-scene__foreground" src={assets.foreground} alt="" width="1696" height="965" />
    </div>
  )
}
