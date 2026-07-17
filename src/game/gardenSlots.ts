export interface GardenSlot {
  slotIndex: number
  row: number
  column: number
  xPercent: number
  yPercent: number
  scale: number
  occupied: boolean
}

const ROW_SCALE = [0.78, 0.9, 1] as const

// Calibrated against the illustrated soil centres in planting-grid.png.
// The slight per-row offsets preserve the artwork's hand-painted perspective.
const SLOT_CENTRES = [
  [[27.3, 38.8], [42.3, 38.8], [57.8, 38.8], [73.0, 38.8]],
  [[26.6, 55.4], [42.2, 55.4], [57.9, 55.4], [73.3, 55.4]],
  [[25.8, 73.2], [41.7, 73.2], [58.0, 73.2], [74.3, 73.2]],
] as const

export const GARDEN_SLOTS: GardenSlot[] = SLOT_CENTRES.flatMap((centres, row) =>
  centres.map(([xPercent, yPercent], column) => ({
    slotIndex: row * centres.length + column,
    row,
    column,
    xPercent,
    yPercent,
    scale: ROW_SCALE[row],
    occupied: false,
  })),
)

export function slotWithOccupancy(occupiedSlots: ReadonlySet<number>): GardenSlot[] {
  return GARDEN_SLOTS.map((slot) => ({ ...slot, occupied: occupiedSlots.has(slot.slotIndex) }))
}

export function findMagneticGardenSlot(
  xPercent: number,
  yPercent: number,
  occupiedSlots: ReadonlySet<number>,
  radiusMultiplier = 1.6,
): GardenSlot | null {
  let closest: GardenSlot | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  const radiusX = 7.2 * radiusMultiplier
  const radiusY = 5.5 * radiusMultiplier

  for (const slot of GARDEN_SLOTS) {
    if (occupiedSlots.has(slot.slotIndex)) continue
    const normalX = (xPercent - slot.xPercent) / radiusX
    const normalY = (yPercent - slot.yPercent) / radiusY
    const distance = normalX * normalX + normalY * normalY
    if (distance <= 1 && distance < closestDistance) {
      closest = slot
      closestDistance = distance
    }
  }

  return closest
}

export function findGardenSlotIncludingOccupied(
  xPercent: number,
  yPercent: number,
  radiusMultiplier = 1.6,
): GardenSlot | null {
  return findMagneticGardenSlot(xPercent, yPercent, new Set<number>(), radiusMultiplier)
}
