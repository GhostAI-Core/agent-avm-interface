'use client'
import { Menu } from 'lucide-react'
import type { Campaign } from '@/types'

const AGENT_DOT: Record<string, string> = {
  seeker: 'bg-blue-500', grace: 'bg-purple-500', sangoma: 'bg-orange-500',
}
const STATUS_BADGE: Record<string, string> = {
  running: 'bg-emerald-500/20 text-emerald-400',
  paused:  'bg-amber-500/20 text-amber-400',
}

export default function TopBar({ title, campaigns, onMenuClick }: {
  title: string
  campaigns: Campaign[]
  onMenuClick: () => void
}) {
  const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused')

  return (
    <div className="flex-shrink-0">
      {/* Main bar */}
      <header className="flex items-center justify-between px-5 h-16 bg-slate-900/70 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="lg:hidden text-slate-400 hover:text-white p-1">
            <Menu size={20} />
          </button>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
            A
          </div>
        </div>
      </header>

      {/* Campaign strip */}
      {active.length > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-slate-950/60 border-b border-white/5 overflow-x-auto">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">Active</span>
          <div className="flex items-center gap-4 flex-wrap">
            {active.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                {i > 0 && <span className="w-px h-5 bg-white/10" />}
                <span className={`w-2 h-2 rounded-full ${AGENT_DOT[c.agent]}`} />
                <span className="text-xs font-medium text-slate-200 whitespace-nowrap">{c.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] ?? 'bg-slate-500/20 text-slate-400'}`}>
                  {c.status}
                </span>
                <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '18%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
