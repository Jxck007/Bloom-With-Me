import { useEffect, useState } from 'react'

export function useFallbackTimer(key: string, delay = 6000): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const timer = window.setTimeout(() => setReady(true), delay)
    return () => window.clearTimeout(timer)
  }, [key, delay])

  return ready
}
