'use client'
import { useEffect, useState } from 'react'

export default function PwaUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration|null>(null)
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
    let userRequested=false
    let reg:ServiceWorkerRegistration
    const watch=async()=>{ reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}); setRegistration(reg); await reg.update(); const check=()=>reg.update().catch(()=>{}); document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check()}); reg.addEventListener('updatefound',()=>{const worker=reg.installing; if(!worker)return; worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)setAvailable(true)})}); navigator.serviceWorker.addEventListener('controllerchange',()=>{if(userRequested&&!document.querySelector('[role="dialog"]'))window.location.reload()}) }
    watch().catch(()=>{})
    const onCheck=async()=>{try{reg=reg||await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});setRegistration(reg);await reg.update();window.dispatchEvent(new CustomEvent('chalo:notice',{detail:'Update check complete'}))}catch{window.dispatchEvent(new CustomEvent('chalo:notice',{detail:'Could not check for updates'}))}}
    const onApply=()=>{if(reg?.waiting&&!document.querySelector('[role="dialog"]')){userRequested=true;reg.waiting.postMessage('SKIP_WAITING')}}
    window.addEventListener('chalo:check-updates',onCheck)
    window.addEventListener('chalo:apply-update',onApply)
    return()=>{window.removeEventListener('chalo:check-updates',onCheck);window.removeEventListener('chalo:apply-update',onApply)}
  },[])
  if(!available)return null
  return <div className="update-toast" role="status"><span>Update available</span><button onClick={()=>window.dispatchEvent(new Event('chalo:apply-update'))}>Reload</button></div>
}
