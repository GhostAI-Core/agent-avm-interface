import { NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/utils/supabase/auth'
import { isScriptStorageConfigured, listCampaignScripts } from '@/lib/avm-script-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * List the script audio files saved in S3 — feeds the campaign-edit "select a saved script"
 * dropdown (issue #31 item 6). Returns [] when script storage isn't configured.
 */
export async function GET() {
  const { user } = await getAuthUser()
  if (!user) return unauthorized()
  if (!isScriptStorageConfigured()) return NextResponse.json({ scripts: [] })
  try {
    return NextResponse.json({ scripts: await listCampaignScripts() })
  } catch (err) {
    console.error('list scripts failed:', err)
    return NextResponse.json({ error: 'Could not list saved scripts' }, { status: 500 })
  }
}
