import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { isOpenPalm, isPinching, isWaving, openPalmScore, pinchScore, waveScore, type GestureName, type WristSample } from '../gesture/gestureMath'

export interface GestureEvent { id: number; name: GestureName }
interface CursorPoint { x: number; y: number; visible: boolean }
export type TrackingStatus = 'idle' | 'starting' | 'ready' | 'unavailable' | 'denied'
export interface HandDebug {
  handVisible: boolean
  landmarks: NormalizedLandmark[]
  currentGesture: GestureName | 'hand-visible' | 'none'
  confidence: number
  handedness: string
}

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export function useHandTracking(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [cursor, setCursor] = useState<CursorPoint>({ x: .5, y: .5, visible: false })
  const [gestureEvent, setGestureEvent] = useState<GestureEvent | null>(null)
  const [debug, setDebug] = useState<HandDebug>({ handVisible:false, landmarks:[], currentGesture:'none', confidence:0, handedness:'' })
  const eventIdRef = useRef(0)
  const stableRef = useRef<Record<GestureName, number>>({ pinch:0, 'open-palm':0, wave:0 })
  const cooldownRef = useRef(0)
  const wristHistoryRef = useRef<WristSample[]>([])

  useEffect(() => {
    if (!enabled) { setStatus('idle'); setDebug(d => ({...d, handVisible:false, landmarks:[], currentGesture:'none'})); return }
    let cancelled = false, frame = 0
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return }
      try {
        setStatus('starting')
        stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:960}, height:{ideal:720} }, audio:false })
        if (cancelled || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
        const create = async (delegate: 'GPU'|'CPU') => HandLandmarker.createFromOptions(vision, {
          baseOptions:{ modelAssetPath:MODEL_URL, delegate }, runningMode:'VIDEO', numHands:1,
          minHandDetectionConfidence:.35, minHandPresenceConfidence:.35, minTrackingConfidence:.35,
        })
        try { landmarker = await create('GPU') } catch { landmarker = await create('CPU') }
        if (cancelled) return
        setStatus('ready')
        let lastTime = -1
        const detect = () => {
          const video = videoRef.current
          if (!video || !landmarker || cancelled) return
          if (video.readyState >= 2 && video.currentTime !== lastTime) {
            lastTime = video.currentTime
            const result = landmarker.detectForVideo(video, performance.now())
            const l = result.landmarks[0]
            const category = result.handednesses?.[0]?.[0]
            if (l) {
              const now = performance.now()
              setCursor({x:1-l[8].x,y:l[8].y,visible:true})
              wristHistoryRef.current = [...wristHistoryRef.current,{x:1-l[0].x,time:now}].filter(s=>now-s.time<1250)
              const scores = { pinch:pinchScore(l), 'open-palm':openPalmScore(l), wave:waveScore(wristHistoryRef.current) }
              const raw = { pinch:isPinching(l), 'open-palm':isOpenPalm(l), wave:isOpenPalm(l)&&isWaving(wristHistoryRef.current) }
              const selected = (['wave','pinch','open-palm'] as GestureName[]).find(g=>raw[g])
              for (const g of ['wave','pinch','open-palm'] as GestureName[]) stableRef.current[g] = g===selected ? stableRef.current[g]+1 : Math.max(0,stableRef.current[g]-1)
              setDebug({handVisible:true, landmarks:l, currentGesture:selected ?? 'hand-visible', confidence:selected ? scores[selected] : Math.max(scores.pinch,scores['open-palm']), handedness:category?.categoryName ?? ''})
              const needed = selected==='wave'?3:selected==='pinch'?4:6
              if(selected && stableRef.current[selected]>=needed && now>=cooldownRef.current){
                eventIdRef.current+=1; setGestureEvent({id:eventIdRef.current,name:selected}); cooldownRef.current=now+1250; stableRef.current[selected]=0
                if(selected==='wave') wristHistoryRef.current=[]
              }
            } else {
              setCursor(c=>({...c,visible:false})); setDebug({handVisible:false,landmarks:[],currentGesture:'none',confidence:0,handedness:''}); stableRef.current={pinch:0,'open-palm':0,wave:0}
            }
          }
          frame=requestAnimationFrame(detect)
        }
        detect()
      } catch (e) {
        setStatus(e instanceof DOMException && e.name==='NotAllowedError' ? 'denied':'unavailable')
      }
    }
    void start()
    return ()=>{cancelled=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());landmarker?.close()}
  },[enabled])
  return {videoRef,status,cursor,gestureEvent,debug}
}
