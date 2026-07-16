export interface RectBounds {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

export function isInsidePotDropZone(bounds: RectBounds | null, clientX: number, clientY: number): boolean {
  if (!bounds) return false
  const horizontalAllowance = Math.max(54, bounds.width * 0.5)
  const topAllowance = Math.max(72, bounds.height * 0.32)
  const bottomAllowance = Math.max(24, bounds.height * 0.1)
  return clientX >= bounds.left - horizontalAllowance
    && clientX <= bounds.right + horizontalAllowance
    && clientY >= bounds.top - topAllowance
    && clientY <= bounds.bottom + bottomAllowance
}

export function resolveSeedDrop(overlapsPot: boolean, trackingWasLost = false): 'planted' | 'returned' {
  return overlapsPot && !trackingWasLost ? 'planted' : 'returned'
}
