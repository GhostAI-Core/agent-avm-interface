import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createRoutrClients, routrClientOptions } from '@/lib/routr/client'
import { routrErrorStatus } from '@/lib/routr/sync-provider-row'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const clients = createRoutrClients()
    const [peers, trunks] = await Promise.all([
      clients.peers.listPeers({ pageSize: 50, pageToken: '' }),
      clients.trunks.listTrunks({ pageSize: 50, pageToken: '' }),
    ])

    return NextResponse.json({
      endpoint: routrClientOptions().endpoint,
      peers: peers.items ?? [],
      trunks: trunks.items ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, routr_unreachable: true }, { status: routrErrorStatus(err) })
  }
}
