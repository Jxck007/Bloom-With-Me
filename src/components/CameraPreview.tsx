import { useEffect, useRef, useState, type RefObject } from 'react'
import type { HandDebug, TrackingStatus } from '../hooks/useHandTracking'

const CONNECTIONS: [number,number][] = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]

export function CameraPreview({videoRef,status,debug,cameraIcon}:{videoRef:RefObject<HTMLVideoElement|null>;status:TrackingStatus;debug:HandDebug;cameraIcon:string}) {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const [expanded,setExpanded]=useState(false)
  useEffect(()=>{
    const canvas=canvasRef.current, video=videoRef.current
    if(!canvas||!video) return
    const ctx=canvas.getContext('2d'); if(!ctx) return
    const draw=()=>{
      const r=canvas.getBoundingClientRect(), dpr=devicePixelRatio||1
      if(canvas.width!==r.width*dpr||canvas.height!==r.height*dpr){canvas.width=r.width*dpr;canvas.height=r.height*dpr}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height)
      if(debug.landmarks.length){
        const p=(i:number)=>({x:(1-debug.landmarks[i].x)*r.width,y:debug.landmarks[i].y*r.height})
        ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='rgba(255,255,255,.92)'
        CONNECTIONS.forEach(([a,b])=>{const A=p(a),B=p(b);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()})
        debug.landmarks.forEach((_,i)=>{const q=p(i);ctx.beginPath();ctx.arc(q.x,q.y,i===4||i===8?6:4,0,Math.PI*2);ctx.fillStyle=i===4||i===8?'#dfa7ae':'#bfd0b8';ctx.fill()})
      }
    }
    draw()
  },[debug,videoRef])
  if(status==='idle') return null
  const label=status==='ready'?(debug.handVisible ? `Hand found · ${debug.currentGesture.replace('-',' ')}`:'Show one hand clearly'):status==='starting'?'Opening camera…':status==='denied'?'Camera permission blocked':'Camera unavailable — touch works'
  const compactLabel=status==='ready'?(debug.handVisible?'Hand found':'Show your hand'):status==='starting'?'Opening camera':status==='denied'?'Camera blocked':'Camera unavailable'
  return <aside className={`camera-preview camera-preview--${status} ${expanded?'camera-preview--expanded':''}`} aria-label="Live hand recognition preview">
    <button
      className="camera-preview__toggle"
      type="button"
      aria-expanded={expanded}
      aria-label={expanded?'Make camera preview compact':'Expand camera preview'}
      onClick={()=>setExpanded(value=>!value)}
    >
      <img src={cameraIcon} alt="" />
    </button>
    <div className="camera-preview__viewport"><video ref={videoRef} autoPlay muted playsInline/><canvas ref={canvasRef}/></div>
    <div className={`camera-preview__badge ${debug.handVisible?'is-found':''}`} aria-label={label} title={label}><span className="camera-dot"/>{compactLabel}</div>
  </aside>
}
