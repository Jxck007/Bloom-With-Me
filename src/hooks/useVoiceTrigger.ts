import { useCallback, useEffect, useRef, useState } from 'react'
type VoiceStatus='idle'|'starting'|'listening'|'heard'|'denied'|'unavailable'
interface SpeechRecognitionEventLike extends Event { results:{[index:number]:{[index:number]:{transcript:string};isFinal?:boolean};length:number} }
interface SpeechRecognitionLike extends EventTarget {continuous:boolean;interimResults:boolean;lang:string;start():void;stop():void;abort():void;onresult:((e:SpeechRecognitionEventLike)=>void)|null;onerror:((e?:Event)=>void)|null;onend:(()=>void)|null}
type SpeechRecognitionConstructor=new()=>SpeechRecognitionLike
declare global {interface Window {SpeechRecognition?:SpeechRecognitionConstructor;webkitSpeechRecognition?:SpeechRecognitionConstructor}}
const WORDS=['grow','go','bloom','flower','வளர்','மலர்']
export function useVoiceTrigger(onTrigger:()=>void){
 const[status,setStatus]=useState<VoiceStatus>('idle'),[level,setLevel]=useState(0),[transcript,setTranscript]=useState('')
 const cleanupRef=useRef<(()=>void)|null>(null),triggeredRef=useRef(false)
 const stop=useCallback(()=>{cleanupRef.current?.();cleanupRef.current=null;if(!triggeredRef.current)setStatus('idle');setLevel(0);setTranscript('')},[])
 const start=useCallback(async()=>{
  cleanupRef.current?.();triggeredRef.current=false;setTranscript('');setStatus('starting')
  if(!navigator.mediaDevices?.getUserMedia){setStatus('unavailable');return}
  let stream:MediaStream|null=null,audioContext:AudioContext|null=null,recognition:SpeechRecognitionLike|null=null,frame=0,loudSince:number|null=null
  let baseline:number[]=[],started=performance.now()
  const finish=()=>{if(triggeredRef.current)return;triggeredRef.current=true;setStatus('heard');recognition?.abort();cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());void audioContext?.close();onTrigger()}
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
   audioContext=new AudioContext();await audioContext.resume();const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.72;source.connect(analyser);const samples=new Float32Array(analyser.fftSize)
   const SR=window.SpeechRecognition??window.webkitSpeechRecognition
   if(SR){recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-IN';recognition.onresult=e=>{const text=Array.from({length:e.results.length},(_,i)=>e.results[i]?.[0]?.transcript??'').join(' ').trim().toLowerCase();setTranscript(text.slice(-48));if(WORDS.some(w=>text.includes(w)))finish()};recognition.onerror=()=>undefined;recognition.onend=()=>{if(!triggeredRef.current&&recognition)try{recognition.start()}catch{}};recognition.start()}
   setStatus('listening')
   const analyse=()=>{if(!analyser||triggeredRef.current)return;analyser.getFloatTimeDomainData(samples);let sum=0;for(const v of samples)sum+=v*v;const rms=Math.sqrt(sum/samples.length);setLevel(Math.min(1,rms*10));const elapsed=performance.now()-started;if(elapsed<1000)baseline.push(rms);else{const base=baseline.length?baseline.reduce((a,b)=>a+b,0)/baseline.length:.01;const threshold=Math.max(.025,base*2.15);if(rms>threshold){loudSince??=performance.now();if(performance.now()-loudSince>420)finish()}else loudSince=null}frame=requestAnimationFrame(analyse)};analyse()
   cleanupRef.current=()=>{recognition?.abort();cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());void audioContext?.close()}
  }catch(e){setStatus(e instanceof DOMException&&e.name==='NotAllowedError'?'denied':'unavailable')}
 },[onTrigger])
 useEffect(()=>stop,[stop]);return{status,level,transcript,start,stop}
}
