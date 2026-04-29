'use client'
import { X, LayoutDashboard, Radio, FileBarChart2 } from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'campaigns', label: 'Campaigns',        icon: Radio },
  { id: 'reports',   label: 'Campaign Report',  icon: FileBarChart2 },
]

const AGENTS = [
  { id: 'seeker',  color: 'bg-blue-500',   label: 'Seeker'  },
  { id: 'grace',   color: 'bg-purple-500', label: 'Grace'   },
  { id: 'sangoma', color: 'bg-orange-500', label: 'Sangoma' },
]

export default function Sidebar({ active, onNav, open, onClose }: {
  active: string
  onNav: (v: string) => void
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Overlay */}
      {open && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />}

      <aside className={`
        fixed top-0 left-0 h-full w-64 z-50 flex flex-col gap-6 p-6
        bg-slate-900/90 backdrop-blur-xl border-r border-white/10
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Agent<span className="text-blue-400">AVM</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">South Africa</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onNav(id); onClose() }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left
                ${active === id
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* Agent legend */}
        <div className="mt-auto pt-4 border-t border-white/10">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-widest">Agents</p>
          <div className="flex flex-col gap-2">
            {AGENTS.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className={`w-2 h-2 rounded-full ${a.color}`} />
                {a.label}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
