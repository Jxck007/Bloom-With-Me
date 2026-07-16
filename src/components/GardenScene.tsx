import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { AssetMap } from '../data/assets'
import type { FlowerChoice, FlowerId } from '../data/flowers'
import { FLOWERS } from '../data/flowers'
import type { CursorPoint, PinchEvent, PinchState } from '../hooks/useHandTracking'
import type { SeedInteractionDebug, SeedInteractionPhase } from '../types/interaction'
import { FlowerArt } from './FlowerArt'

type VisualGameStep = 'welcome' | 'choose' | 'plant' | 'sun' | 'rain' | 'grow' | 'reveal' | 'final'
type DragSource = 'hand' | 'pointer' | null

interface DragState {
  phase: SeedInteractionPhase
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
  step: VisualGameStep
  selected: FlowerChoice | null
  completed: FlowerId[]
  availableFlowers?: FlowerChoice[]
  onPlantFlower?: (flower: FlowerChoice) => void
  onInteractionDebug?: (debug: SeedInteractionDebug) => void
  handCursor?: CursorPoint
  pinchEvent?: PinchEvent | null
  pinchState?: PinchState
  planted: boolean
  sunny: boolean
  raining: boolean
  grown: boolean
}

const idleDrag = (): DragState => ({
  phase: 'idle',
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
  completed,
  availableFlowers = [],
  onPlantFlower,
  onInteractionDebug,
  handCursor = { x: 0.5, y: 0.5, visible: false },
  pinchEvent = null,
  pinchState = 'open',
  planted,
  sunny,
  raining,
  grown,
}: GardenSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const potRef = useRef<HTMLImageElement>(null)
  const packetRefs = useRef(new Map<FlowerId, HTMLButtonElement>())
  const dragRef = useRef<DragState>(idleDrag())
  const hoveredRef = useRef<FlowerChoice | null>(null)
  const lastPinchEventRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const returnTimerRef = useRef<number | null>(null)
  const transitionFrameRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState>(dragRef.current)
  const [hovered, setHovered] = useState<FlowerChoice | null>(null)
  const [dropZoneOverlap, setDropZoneOverlap] = useState(false)

  const showSun = step === 'sun' || sunny
  const showCloud = step === 'rain' || raining
  const pot = raining || step === 'reveal'
    ? assets.pots.watered
    : planted
      ? assets.pots.planted
      : assets.pots.empty

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
      x: handCursor.x * bounds.width,
      y: handCursor.y * bounds.height,
    }
  }, [handCursor.x, handCursor.y])

  const flowerAtPoint = useCallback((clientX: number, clientY: number) => {
    for (const flower of availableFlowers) {
      const bounds = packetRefs.current.get(flower.id)?.getBoundingClientRect()
      if (bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) {
        return flower
      }
    }
    return null
  }, [availableFlowers])

  const overlapsPot = useCallback((clientX: number, clientY: number) => {
    const bounds = potRef.current?.getBoundingClientRect()
    if (!bounds) return false
    const horizontalAllowance = Math.max(54, bounds.width * 0.5)
    const topAllowance = Math.max(72, bounds.height * 0.32)
    const bottomAllowance = Math.max(24, bounds.height * 0.1)
    return clientX >= bounds.left - horizontalAllowance
      && clientX <= bounds.right + horizontalAllowance
      && clientY >= bounds.top - topAllowance
      && clientY <= bounds.bottom + bottomAllowance
  }, [])

  const beginDrag = useCallback((flower: FlowerChoice, source: Exclude<DragSource, null>, clientX: number, clientY: number, pointerId: number | null) => {
    if (performance.now() < cooldownUntilRef.current || dragRef.current.flower) return
    const packetBounds = packetRefs.current.get(flower.id)?.getBoundingClientRect()
    const sceneBounds = sceneRef.current?.getBoundingClientRect()
    if (!packetBounds || !sceneBounds) return
    const point = localPoint(clientX, clientY)
    const originX = packetBounds.left + packetBounds.width / 2 - sceneBounds.left
    const originY = packetBounds.top + packetBounds.height / 2 - sceneBounds.top
    const startPhase: SeedInteractionPhase = source === 'hand' ? 'pinch-started' : 'seed-grabbed'
    const next: DragState = { phase: startPhase, source, flower, x: point.x, y: point.y, originX, originY, pointerId }
    updateDrag(next)
    updateHovered(flower)
    setDropZoneOverlap(overlapsPot(clientX, clientY))

    transitionFrameRef.current = requestAnimationFrame(() => {
      if (dragRef.current.flower?.id !== flower.id || dragRef.current.source !== source) return
      updateDrag({ ...dragRef.current, phase: 'seed-grabbed' })
    })
  }, [localPoint, overlapsPot, updateDrag, updateHovered])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const current = dragRef.current
    if (!current.flower) return
    const point = localPoint(clientX, clientY)
    updateDrag({ ...current, phase: 'dragging', x: point.x, y: point.y })
    setDropZoneOverlap(overlapsPot(clientX, clientY))
  }, [localPoint, overlapsPot, updateDrag])

  const finishDrag = useCallback((clientX: number, clientY: number, lost = false) => {
    const current = dragRef.current
    if (!current.flower) return
    const point = localPoint(clientX, clientY)
    const released: DragState = { ...current, phase: 'pinch-released', x: point.x, y: point.y }
    const accepted = !lost && overlapsPot(clientX, clientY)
    updateDrag(released)
    setDropZoneOverlap(accepted)

    transitionFrameRef.current = requestAnimationFrame(() => {
      const latest = dragRef.current
      if (!latest.flower || latest.flower.id !== current.flower?.id) return
      if (accepted) {
        cooldownUntilRef.current = performance.now() + 700
        updateDrag({ ...latest, phase: 'planted' })
        onPlantFlower?.(latest.flower)
        return
      }

      updateDrag({ ...latest, phase: 'returned', x: latest.originX, y: latest.originY })
      setDropZoneOverlap(false)
      returnTimerRef.current = window.setTimeout(() => {
        updateDrag(idleDrag())
        updateHovered(null)
      }, 420)
    })
  }, [localPoint, onPlantFlower, overlapsPot, updateDrag, updateHovered])

  useEffect(() => {
    if (step !== 'choose') {
      updateDrag(idleDrag())
      updateHovered(null)
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
    } else if (!dragRef.current.flower) {
      updateHovered(flowerAtPoint(point.clientX, point.clientY))
    }
  }, [flowerAtPoint, handClientPoint, handCursor.visible, moveDrag, pinchState, step, updateDrag, updateHovered])

  useEffect(() => {
    if (!pinchEvent || pinchEvent.id === lastPinchEventRef.current || step !== 'choose') return
    lastPinchEventRef.current = pinchEvent.id
    const point = handClientPoint()
    if (!point) return

    if (pinchEvent.phase === 'start' && hoveredRef.current && !dragRef.current.flower) {
      beginDrag(hoveredRef.current, 'hand', point.clientX, point.clientY, null)
    } else if (pinchEvent.phase === 'release' && dragRef.current.source === 'hand') {
      finishDrag(point.clientX, point.clientY, pinchEvent.reason === 'lost')
    }
  }, [beginDrag, finishDrag, handClientPoint, pinchEvent, step])

  useEffect(() => {
    onInteractionDebug?.({
      phase: drag.phase,
      hoveredPacket: hovered?.id ?? null,
      grabbedSeed: drag.flower?.id ?? null,
      dropZoneOverlap,
    })
  }, [drag.flower?.id, drag.phase, dropZoneOverlap, hovered?.id, onInteractionDebug])

  useEffect(() => () => {
    if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current)
    if (transitionFrameRef.current !== null) cancelAnimationFrame(transitionFrameRef.current)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, flower: FlowerChoice) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    beginDrag(flower, 'pointer', event.clientX, event.clientY, event.pointerId)
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
    if (dragRef.current.source !== 'pointer' || dragRef.current.pointerId !== event.pointerId) return
    finishDrag(event.clientX, event.clientY, true)
  }

  return (
    <div
      ref={sceneRef}
      className={`garden-scene garden-scene--${step} garden-scene--interaction-${drag.phase} ${sunny ? 'garden-scene--sunny' : ''}`}
    >
      <img className="garden-scene__background" src={assets.background} alt="" />

      <img
        className={`garden-weather garden-weather--sun ${showSun ? 'is-visible' : ''} ${sunny ? 'is-active' : ''}`}
        src={assets.sun}
        alt=""
      />
      <img
        className={`garden-weather garden-weather--cloud ${showCloud ? 'is-visible' : ''}`}
        src={assets.cloud}
        alt=""
      />

      {raining && (
        <div className="rain" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
      )}

      <div className="garden-scene__finished" aria-label="Completed flowers">
        {FLOWERS.filter((flower) => completed.includes(flower.id)).map((flower) => (
          <FlowerArt key={flower.id} flower={flower} frames={assets.flowers[flower.id]} grown compact />
        ))}
      </div>

      {step === 'choose' && onPlantFlower && (
        <div className="garden-seed-options" role="group" aria-label="Choose and drag a seed packet to the pot">
          {availableFlowers.map((flower) => {
            const grabbed = drag.flower?.id === flower.id
            const isHovered = hovered?.id === flower.id
            return (
              <button
                key={flower.id}
                ref={(element) => {
                  if (element) packetRefs.current.set(flower.id, element)
                  else packetRefs.current.delete(flower.id)
                }}
                className={`garden-seed-option garden-seed-option--${flower.id} ${isHovered ? 'is-hovered' : ''} ${grabbed ? 'is-grabbed' : ''}`}
                type="button"
                aria-label={`Drag ${flower.name} seed packet to the pot`}
                onPointerDown={(event) => onPointerDown(event, flower)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onClick={(event) => {
                  if (event.detail === 0) onPlantFlower(flower)
                }}
              >
                <img src={assets.seeds[flower.id].packet} alt="" draggable={false} />
                <span>{flower.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {drag.flower && (
        <img
          className={`seed-drag-item seed-drag-item--${drag.phase}`}
          style={{ left: drag.x, top: drag.y }}
          src={assets.seeds[drag.flower.id].seed}
          alt=""
          aria-hidden="true"
        />
      )}

      <div className={`pot-drop-zone ${dropZoneOverlap ? 'is-overlapping' : ''}`} aria-hidden="true" />

      <div className="pot-area">
        {selected && (
          <img
            className={`seed-flight ${planted ? 'seed-flight--planted' : ''}`}
            src={assets.seeds[selected.id].seed}
            alt=""
          />
        )}

        {selected && planted && (
          <FlowerArt flower={selected} frames={assets.flowers[selected.id]} grown={grown} />
        )}

        <img className="pot" ref={potRef} src={pot} alt="Flower pot" />
      </div>

      {handCursor.visible && (
        <img
          className="butterfly-cursor butterfly-cursor--garden"
          style={{ left: `${handCursor.x * 100}%`, top: `${handCursor.y * 100}%` }}
          src={assets.gestures.cursor}
          alt=""
          aria-hidden="true"
        />
      )}

      <img className="garden-scene__foreground" src={assets.foreground} alt="" />
    </div>
  )
}
