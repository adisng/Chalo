'use client'

import { useEffect, useState } from 'react'

export function Splash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const started = performance.now()
    const hide = () => { const delay = Math.max(0, 600 - (performance.now() - started)); window.setTimeout(() => setVisible(false), delay) }
    if (ready) hide()
    const timeout = window.setTimeout(() => setVisible(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [ready])
  if (!visible) return null
  return <div className="splash" aria-label="Loading Chalo"><svg className="splash-icon" viewBox="0 0 100 100" aria-hidden="true"><circle className="splash-dot" cx="23" cy="72" r="7"/><circle className="splash-dot splash-dot-2" cx="77" cy="72" r="7"/><path className="splash-route" d="M23 72C34 34 56 34 77 72"/><path className="splash-arrow" d="M68 67L82 72L72 82Z"/></svg><strong>Chalo</strong><span>Let's go.</span></div>
}
