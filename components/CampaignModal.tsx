'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface Props { onClose: () => void; onCreated: () => void }

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="font-semibold text-white">New Campaign</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Campaign Name</label>
              <input name="name" required placeholder="e.g. 1Life BMI AI V5.0"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Agent</label>
              <select name="agent" required className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">— Select —</option>
                <option value="seeker">Seeker</option>
                <option value="grace">Grace</option>
                <option value="sangoma">Sangoma</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dialing Speed (calls/sec)</label>
              <input name="dialing_speed" type="number" min="1" max="10" defaultValue="1"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Window Start</label>
              <input name="window_start" type="time" defaultValue="08:00"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Window End</label>
              <input name="window_end" type="time" defaultValue="20:00"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Voice Recording</label>
              <input name="voice_file" type="file" accept="audio/*"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-white/10 hover:bg-white/5">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
