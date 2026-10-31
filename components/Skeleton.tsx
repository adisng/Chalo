export function Skeleton({ kind = 'block', className = '' }: { kind?: 'block' | 'line' | 'circle' | 'chip'; className?: string }) { return <span className={`skeleton skeleton-${kind} ${className}`} aria-hidden="true" /> }
export function ScreenSkeleton({ screen }: { screen: 'today' | 'schedule' | 'hostels' | 'detail' | 'tasks' }) {
  const rows = screen === 'hostels' ? 5 : screen === 'schedule' ? 6 : screen === 'tasks' ? 5 : 2
  return <section className={`screen-skeleton ${screen}`} aria-busy="true" aria-label="Loading"><span className="sr-only">Loading</span><Skeleton kind="block" className="skeleton-hero" />{Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><Skeleton kind={screen === 'tasks' ? 'circle' : 'block'} /><div><Skeleton kind="line" /><Skeleton kind="line" className="short" /></div><Skeleton kind="chip" /></div>)}</section>
}
