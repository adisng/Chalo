import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(); const buildId=process.env.VERCEL_GIT_COMMIT_SHA||String(Date.now()); const swPath=path.join(root,'out','sw.js'); const infoPath=path.join(root,'out','build-info.json')
if(!fs.existsSync(swPath))throw new Error(`Missing exported service worker: ${swPath}`)
fs.writeFileSync(swPath,fs.readFileSync(swPath,'utf8').replaceAll('__BUILD_ID__',buildId))
fs.writeFileSync(infoPath,JSON.stringify({buildId,builtAt:new Date().toISOString()})+'\n')
