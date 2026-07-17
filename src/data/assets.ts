import { useEffect, useState } from 'react'
import type { FlowerId } from './flowers'

export interface AssetMap {
  background: string
  foreground: string
  weather: {
    sun: string
    cloudNormal: string
    cloudRain: string
    droplets: {
      small: string
      medium: string
      large: string
    }
  }
  seeds: Record<FlowerId, { packet: string; seed: string }>
  pots: {
    empty: string
    planted: string
    watered: string
  }
  flowers: Record<FlowerId, string[]>
  gestures: {
    cursor: string
    pinch: string
    palm: string
    wave: string
  }
  ui: {
    camera: string
    microphone: string
    sound: string
    restart: string
    help: string
  }
  garden: {
    plantingGrid: string
    columns: number
    rows: number
    slotsPerPage: number
  }
}

interface AssetMapState {
  assets: AssetMap | null
  error: boolean
}

export function useAssetMap(): AssetMapState {
  const [state, setState] = useState<AssetMapState>({ assets: null, error: false })

  useEffect(() => {
    let cancelled = false

    fetch('/assets/asset-map.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Asset map request failed with ${response.status}`)
        return response.json() as Promise<AssetMap>
      })
      .then((assets) => {
        if (!cancelled) setState({ assets, error: false })
      })
      .catch(() => {
        if (!cancelled) setState({ assets: null, error: true })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
