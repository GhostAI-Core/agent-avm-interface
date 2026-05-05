import { supabase } from './supabase'

/**
 * Simulates call activity for running campaigns.
 * This is used for demo purposes to show real-time dashboard updates.
 */
export async function runSimulation() {
  if (!supabase) return

  // 1. Find all 'running' campaigns
  const { data: campaigns } = await supabase.from('campaigns').select('*').eq('status', 'running')
  if (!campaigns || !campaigns.length) return

  for (const campaign of campaigns) {
    // Generate N calls based on dialing_speed (calls/sec)
    const speed = campaign.dialing_speed || 1
    const outcomes = ['connected', 'voicemail', 'no_speech', 'hangup', 'ni', 'dnq', 'callback', 'no_answer', 'busy_line', 'failed']
    
    for (let i = 0; i < speed; i++) {
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)]
      const duration = outcome === 'connected' ? `${Math.floor(Math.random() * 5)}:${Math.floor(Math.random() * 60).toString().padStart(2,'0')}` : '0:00'
      
      await supabase.from('call_logs').insert({
        campaign_id: campaign.id,
        phone: `+27 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000}`,
        outcome,
        duration,
        called_at: new Date().toISOString()
      })
    }
  }
}
