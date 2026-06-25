import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * List previously-saved voice scripts (text + voice + audio URL), newest first — feeds the voice
 * generator's "reuse a previous script" bubbles. Global across campaigns. Rows are written by
 * /api/tts/save when a generated script is saved.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return unauthorized()

  const { data, error } = await supabase
    .from('voice_scripts')
    .select('id, text, voice_id, audio_url, campaign_name, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('list voice_scripts failed:', error)
    return NextResponse.json({ error: 'Could not list saved scripts' }, { status: 500 })
  }
  return NextResponse.json({ scripts: data ?? [] })
}
