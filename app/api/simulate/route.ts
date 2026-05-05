import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const OUTCOMES = [
  { status: 'qualified', weight: 15 },
  { status: 'connected', weight: 20 },
  { status: 'voicemail', weight: 25 },
  { status: 'no_answer', weight: 20 },
  { status: 'hangup', weight: 10 },
  { status: 'failed', weight: 10 },
]

function getRandomOutcome() {
  const total = OUTCOMES.reduce((sum, o) => sum + o.weight, 0)
  let random = Math.random() * total
  for (const outcome of OUTCOMES) {
    if (random < outcome.weight) return outcome.status
    random -= outcome.weight
  }
  return 'failed'
}

export async function POST(req: NextRequest) {
  try {
    const { campaignId } = await req.json()
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Fetch Campaign
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (cErr || !campaign) throw new Error('Campaign not found')

    // 2. Fetch Contacts
    const { data: contacts, error: cntErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(50) // Simulate in batches of 50

    if (cntErr) throw cntErr

    if (!contacts || contacts.length === 0) {
      await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaignId)
      return NextResponse.json({ message: 'Campaign completed', status: 'completed' })
    }

    // 3. Simulate Dials
    const callLogs = contacts.map(c => {
      const outcome = getRandomOutcome()
      const duration = outcome === 'qualified' || outcome === 'connected' 
        ? `${Math.floor(Math.random() * 3)}:${Math.floor(Math.random() * 59).toString().padStart(2,'0')}`
        : '0:00'
      
      const cpl = outcome === 'qualified' ? 1.50 : 0
      const spent = 0.05 + (Math.random() * 0.10) // Small per-call cost simulation

      return {
        campaign_id: campaignId,
        phone_number: c.phone,
        status: outcome,
        duration,
        cpl,
        total_spent: spent,
        called_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    })

    // 4. Batch insert logs
    const { error: logErr } = await supabase.from('call_logs').insert(callLogs)
    if (logErr) throw logErr

    // 5. Mark contacts as dialed
    const contactIds = contacts.map(c => c.id)
    await supabase.from('contacts').update({ status: 'dialed' }).in('id', contactIds)

    // 6. Log security event
    await supabase.from('security_logs').insert({
      event_type: 'campaign_execution',
      agent_name: 'System Engine',
      details: `Executed simulation for campaign ${campaign.name}. Dialed ${contacts.length} contacts.`,
      ip_address: '127.0.0.1'
    })

    return NextResponse.json({ 
      message: `Successfully dialed ${contacts.length} contacts`, 
      dialed: contacts.length 
    })

  } catch (err: any) {
    console.error('SIMULATION ERROR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
