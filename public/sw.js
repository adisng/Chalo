const VERSION = '__BUILD_ID__'
const SHELL = 'chalo-shell-' + VERSION
const ASSETS = 'chalo-assets-' + VERSION
const APP = ['/', '/manifest.webmanifest', '/brand/chalo-icon.svg', '/brand/chalo-logo.svg', '/favicon.svg']
self.addEventListener('install', event => { event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(APP))) })
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== SHELL && !key.startsWith('chalo-assets-')).map(key => caches.delete(key)))).then(() => self.clients.claim())) })
function timeoutFetch(request, milliseconds = 3000) { return Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), milliseconds))]) }
self.addEventListener('fetch', event => { const request=event.request; if(request.method!=='GET')return; const url=new URL(request.url); if(url.origin!==self.location.origin)return; if(request.mode==='navigate'||request.destination==='document'){event.respondWith(timeoutFetch(request).then(response=>{const copy=response.clone();caches.open(SHELL).then(cache=>cache.put(request,copy));return response}).catch(()=>caches.match(request).then(cached=>cached||caches.match('/'))));return} if(url.pathname.startsWith('/_next/static/')){event.respondWith(caches.open(ASSETS).then(cache=>cache.match(request).then(cached=>cached||fetch(request).then(response=>{cache.put(request,response.clone());return response}))));return} event.respondWith(caches.open(ASSETS).then(cache=>cache.match(request).then(cached=>{const network=fetch(request).then(response=>{cache.put(request,response.clone());return response});return cached||network}))) })
self.addEventListener('message', event => { if(event.data==='SKIP_WAITING')self.skipWaiting() })
