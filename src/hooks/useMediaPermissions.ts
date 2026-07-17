import { useCallback, useEffect, useRef, useState } from 'react'
import { permissionFailure, type PermissionFailure } from '../media/permissionState'

export type MediaPermissionStatus =
  | 'not-requested'
  | 'requesting'
  | 'camera-and-microphone-ready'
  | 'camera-only'
  | 'microphone-only'
  | 'denied'
  | 'unavailable'

export type DevicePermissionStatus = 'not-requested' | 'requesting' | 'ready' | 'denied' | 'unavailable'

export interface MediaPermissionResult {
  stream: MediaStream | null
  camera: DevicePermissionStatus
  microphone: DevicePermissionStatus
  status: MediaPermissionStatus
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 640 },
  height: { ideal: 480 },
}

const initialResult: MediaPermissionResult = {
  stream: null,
  camera: 'not-requested',
  microphone: 'not-requested',
  status: 'not-requested',
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop()
  })
}

function failedDevice(failure: PermissionFailure): DevicePermissionStatus {
  return failure === 'denied' ? 'denied' : 'unavailable'
}

function overallStatus(
  camera: DevicePermissionStatus,
  microphone: DevicePermissionStatus,
): MediaPermissionStatus {
  if (camera === 'ready' && microphone === 'ready') return 'camera-and-microphone-ready'
  if (camera === 'ready') return 'camera-only'
  if (microphone === 'ready') return 'microphone-only'
  if (camera === 'denied' || microphone === 'denied') return 'denied'
  return 'unavailable'
}

export function useMediaPermissions() {
  const [result, setResult] = useState<MediaPermissionResult>(initialResult)
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef<Promise<MediaPermissionResult> | null>(null)
  const mountedRef = useRef(true)

  const request = useCallback(async (): Promise<MediaPermissionResult> => {
    const retainedStream = streamRef.current
    const retainedVideo = retainedStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false
    const retainedAudio = retainedStream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false
    if (retainedVideo && retainedAudio) {
      return result
    }
    if (requestRef.current) return requestRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      const unavailable: MediaPermissionResult = {
        stream: null,
        camera: 'unavailable',
        microphone: 'unavailable',
        status: 'unavailable',
      }
      setResult(unavailable)
      return unavailable
    }

    if (retainedStream && (retainedVideo || retainedAudio)) {
      setResult((current) => ({
        ...current,
        camera: retainedVideo ? 'ready' : 'requesting',
        microphone: retainedAudio ? 'ready' : 'requesting',
        status: 'requesting',
      }))
      const missingDeviceRequest = (async () => {
        try {
          const missing = await navigator.mediaDevices.getUserMedia({
            video: retainedVideo ? false : VIDEO_CONSTRAINTS,
            audio: retainedAudio ? false : true,
          })
          const tracks = [
            ...retainedStream.getTracks().filter((track) => track.readyState === 'live'),
            ...missing.getTracks(),
          ]
          const stream = new MediaStream(tracks)
          const camera: DevicePermissionStatus = stream.getVideoTracks().length ? 'ready' : 'unavailable'
          const microphone: DevicePermissionStatus = stream.getAudioTracks().length ? 'ready' : 'unavailable'
          const next = { stream, camera, microphone, status: overallStatus(camera, microphone) }
          streamRef.current = stream
          if (mountedRef.current) setResult(next)
          return next
        } catch (error) {
          const missingStatus = failedDevice(permissionFailure(error))
          const camera: DevicePermissionStatus = retainedVideo ? 'ready' : missingStatus
          const microphone: DevicePermissionStatus = retainedAudio ? 'ready' : missingStatus
          const next = {
            stream: retainedStream,
            camera,
            microphone,
            status: overallStatus(camera, microphone),
          }
          if (mountedRef.current) setResult(next)
          return next
        }
      })()
      requestRef.current = missingDeviceRequest
      try {
        return await missingDeviceRequest
      } finally {
        requestRef.current = null
      }
    }

    setResult((current) => ({
      ...current,
      camera: 'requesting',
      microphone: 'requesting',
      status: 'requesting',
    }))

    const pending = (async () => {
      try {
        const combined = await navigator.mediaDevices.getUserMedia({
          video: VIDEO_CONSTRAINTS,
          audio: true,
        })
        const camera = combined.getVideoTracks().length ? 'ready' : 'unavailable'
        const microphone = combined.getAudioTracks().length ? 'ready' : 'unavailable'
        const next: MediaPermissionResult = {
          stream: combined,
          camera,
          microphone,
          status: overallStatus(camera, microphone),
        }
        streamRef.current = combined
        if (mountedRef.current) setResult(next)
        return next
      } catch {
        // Some browsers reject the combined request when only one device or
        // permission is unavailable. Retry both within this same user action
        // so camera and microphone can be handled independently.
        const [cameraAttempt, microphoneAttempt] = await Promise.allSettled([
          navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false }),
          navigator.mediaDevices.getUserMedia({ video: false, audio: true }),
        ])
        const camera = cameraAttempt.status === 'fulfilled'
          ? 'ready'
          : failedDevice(permissionFailure(cameraAttempt.reason))
        const microphone = microphoneAttempt.status === 'fulfilled'
          ? 'ready'
          : failedDevice(permissionFailure(microphoneAttempt.reason))
        const tracks = [
          ...(cameraAttempt.status === 'fulfilled' ? cameraAttempt.value.getVideoTracks() : []),
          ...(microphoneAttempt.status === 'fulfilled' ? microphoneAttempt.value.getAudioTracks() : []),
        ]
        const stream = tracks.length ? new MediaStream(tracks) : null
        const next: MediaPermissionResult = {
          stream,
          camera,
          microphone,
          status: overallStatus(camera, microphone),
        }
        streamRef.current = stream
        if (mountedRef.current) setResult(next)
        return next
      }
    })()

    requestRef.current = pending
    try {
      return await pending
    } finally {
      requestRef.current = null
    }
  }, [result])

  const stop = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setResult(initialResult)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  return { ...result, request, stop }
}
