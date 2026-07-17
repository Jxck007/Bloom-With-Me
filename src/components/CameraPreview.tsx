import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { HandDebug, TrackingStatus } from '../hooks/useHandTracking'
import type { SeedInteractionDebug } from '../types/interaction'
import { AssetImage } from './AssetImage'

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  status: TrackingStatus
  debug: HandDebug
  interaction: SeedInteractionDebug
  cameraIcon: string
  onEnable: () => void
  onRetry: () => void
  onDisable: () => void
}

function statusCopy(status: TrackingStatus, handVisible: boolean) {
  if (status === 'active') return handVisible ? 'Camera active · Hand found' : 'Camera active · No hand found'
  if (status === 'requesting') return 'Requesting permission…'
  if (status === 'retrying') return 'Retrying camera…'
  if (status === 'permission-denied') return 'Camera permission denied'
  if (status === 'unsupported') return 'Camera unsupported'
  if (status === 'unavailable') return 'Camera unavailable'
  return 'Camera inactive'
}

export function CameraPreview({
  videoRef,
  status,
  debug,
  interaction,
  cameraIcon,
  onEnable,
  onRetry,
  onDisable,
}: CameraPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [canvasResolution, setCanvasResolution] = useState({ width: 0, height: 0 })

  const drawOverlay = useCallback(() => {
    const viewport = viewportRef.current
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!viewport || !canvas || !video) return
    const context = canvas.getContext('2d')
    if (!context) return

    const bounds = viewport.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const backingWidth = Math.max(1, Math.round(bounds.width * dpr))
    const backingHeight = Math.max(1, Math.round(bounds.height * dpr))
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth
      canvas.height = backingHeight
      setCanvasResolution({ width: backingWidth, height: backingHeight })
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)
    if (!showSkeleton || debug.landmarks.length !== 21 || !video.videoWidth || !video.videoHeight) return

    // The video is mirrored in CSS. This cover transform mirrors landmark x once,
    // including any horizontal or vertical crop introduced by object-fit: cover.
    const scale = Math.max(bounds.width / video.videoWidth, bounds.height / video.videoHeight)
    const renderedWidth = video.videoWidth * scale
    const renderedHeight = video.videoHeight * scale
    const offsetX = (bounds.width - renderedWidth) / 2
    const offsetY = (bounds.height - renderedHeight) / 2
    const point = (index: number) => ({
      x: offsetX + (1 - debug.landmarks[index].x) * renderedWidth,
      y: offsetY + debug.landmarks[index].y * renderedHeight,
    })

    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2.5
    context.strokeStyle = 'rgba(255, 250, 245, 0.94)'
    for (const [start, end] of CONNECTIONS) {
      const from = point(start)
      const to = point(end)
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }

    const thumb = point(4)
    const index = point(8)
    context.lineWidth = 2
    context.strokeStyle = '#b76f79'
    context.beginPath()
    context.moveTo(thumb.x, thumb.y)
    context.lineTo(index.x, index.y)
    context.stroke()

    debug.landmarks.forEach((_, landmarkIndex) => {
      const landmark = point(landmarkIndex)
      context.beginPath()
      context.arc(landmark.x, landmark.y, landmarkIndex === 8 ? 5.5 : 3.5, 0, Math.PI * 2)
      context.fillStyle = landmarkIndex === 8 ? '#b76f79' : landmarkIndex === 4 ? '#dfa7ae' : '#bfd0b8'
      context.fill()
    })

    context.font = '700 11px "Trebuchet MS", sans-serif'
    context.fillStyle = 'rgba(65, 48, 43, 0.86)'
    context.fillText(`${debug.currentGesture.replace('-', ' ')} · ${Math.round(debug.confidence * 100)}%`, 9, bounds.height - 10)
  }, [debug, showSkeleton, videoRef])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay, expanded])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(drawOverlay)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [drawOverlay])

  const active = status === 'active'
  const busy = status === 'requesting' || status === 'retrying'
  const retryable = status === 'permission-denied' || status === 'unavailable'
  const label = statusCopy(status, debug.handVisible)
  const hint = active
    ? debug.handVisible
      ? 'Keep your hand relaxed and inside the frame.'
      : 'Try brighter light and hold your hand a little farther away.'
    : 'Touch play is always available.'

  return (
    <aside className={`camera-preview camera-preview--${status} ${expanded ? 'camera-preview--expanded' : ''}`} aria-label="Hand camera controls">
      <button
        className="camera-preview__toggle"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse camera preview' : 'Expand camera preview'}
        onClick={() => setExpanded((value) => !value)}
      >
        <AssetImage src={cameraIcon} alt="" />
      </button>

      <div className="camera-preview__viewport" ref={viewportRef}>
        <video ref={videoRef} autoPlay muted playsInline />
        <canvas ref={canvasRef} aria-hidden="true" />
        {!active && (
          <div className="camera-preview__start">
            {status === 'not-started' && (
              <button type="button" onClick={onEnable}>Enable Hands &amp; Voice</button>
            )}
            {retryable && (
              <button type="button" onClick={onRetry}>Retry</button>
            )}
            {busy && <span>Opening…</span>}
          </div>
        )}
      </div>

      <div className={`camera-preview__badge ${active ? 'is-active' : ''} ${debug.handVisible ? 'is-found' : ''}`} role="status">
        <span className="camera-dot" />
        {label}
      </div>

      {(status === 'permission-denied' || status === 'unavailable' || status === 'unsupported') && (
        <p className="camera-preview__touch-note">Use touch — camera is optional.</p>
      )}

      {expanded && (
        <div className="camera-preview__expanded-content">
          <p className="camera-preview__hint">{hint}</p>
          <div className="camera-preview__actions">
            {active && (
              <>
                <button type="button" aria-pressed={showSkeleton} onClick={() => setShowSkeleton((value) => !value)}>
                  {showSkeleton ? 'Hide skeleton' : 'Show skeleton'}
                </button>
                <button type="button" onClick={onDisable}>Turn camera off</button>
              </>
            )}
            {busy && <button type="button" onClick={onDisable}>Cancel</button>}
          </div>

          <details className="detection-details">
            <summary>Detection Details</summary>
            <dl>
              <div><dt>Camera</dt><dd>{debug.cameraWidth} × {debug.cameraHeight}</dd></div>
              <div><dt>Canvas</dt><dd>{canvasResolution.width} × {canvasResolution.height}</dd></div>
              <div><dt>Delegate</dt><dd>{debug.delegate}</dd></div>
              <div><dt>Processing</dt><dd>{debug.processingFps} FPS</dd></div>
              <div><dt>Hand detected</dt><dd>{debug.handVisible ? 'yes' : 'no'}</dd></div>
              <div><dt>Handedness</dt><dd>{debug.handedness || '—'}</dd></div>
              <div><dt>Pinch ratio</dt><dd>{debug.pinchRatio?.toFixed(3) ?? '—'}</dd></div>
              <div><dt>Pinch state</dt><dd>{debug.pinchState}</dd></div>
              <div><dt>Cursor</dt><dd>{debug.cursorX === null ? '—' : `${debug.cursorX.toFixed(3)}, ${debug.cursorY?.toFixed(3)}`}</dd></div>
              <div><dt>Hovered packet</dt><dd>{interaction.hoveredPacket ?? '—'}</dd></div>
              <div><dt>Grabbed seed</dt><dd>{interaction.grabbedSeed ?? '—'}</dd></div>
              <div><dt>Drop-zone overlap</dt><dd>{interaction.dropZoneOverlap ? 'yes' : 'no'}</dd></div>
              <div><dt>Lost frames</dt><dd>{debug.lostFrameCount}</dd></div>
              <div><dt>Interaction</dt><dd>{interaction.phase}</dd></div>
            </dl>
          </details>
        </div>
      )}
    </aside>
  )
}
