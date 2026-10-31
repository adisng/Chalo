'use client'

import { useEffect, useState } from 'react'

export default function SplashGate() {
  const [visible, setVisible] = useState(true)
  useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 1000); return () => window.clearTimeout(timer) }, [])
  if (!visible) return null
  return <div className="splash splash-first-frame" aria-label="Loading Chalo"><img src="/brand/chalo-icon.svg" alt=""/><strong>Chalo</strong><span>Let's go.</span></div>
}
