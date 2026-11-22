import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const buildId=process.env.VERCEL_GIT_COMMIT_SHA||String(Date.now()); const swPath=path.join(root,'out','sw.js'); const infoPath=path.join(root,'out','build-info.json'); const staticDir=path.join(root,'out','_next','static')
if(!fs.existsSync(swPath))throw new Error(`Missing exported service worker: ${swPath}`)
const assets=[]
function collect(directory){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())collect(full);else assets.push('/'+path.relative(path.join(root,'out'),full).split(path.sep).join('/'))}}
collect(staticDir)
const source=fs.readFileSync(swPath,'utf8').replaceAll('__BUILD_ID__',buildId).replaceAll("'__STATIC_ASSETS__'",JSON.stringify(JSON.stringify(assets)))
if(source.includes('__BUILD_ID__')||source.includes('__STATIC_ASSETS__'))throw new Error('Service worker build placeholders were not fully replaced.')
fs.writeFileSync(swPath,source)
fs.writeFileSync(infoPath,JSON.stringify({buildId,builtAt:new Date().toISOString()})+'\n')
