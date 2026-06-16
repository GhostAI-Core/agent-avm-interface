#!/usr/bin/env npx tsx
import './preload-env'

/**
 * Dry-run trunk resolution — does not place a call.
 *
 * Usage:
 *   npm run dial:route -- --campaign-id 9
 *   npm run dial:route -- --campaign-id 9 --route routr
 */

import { createClient } from '@supabase/supabase-js'
import { resolveTrunkWithSource } from '../lib/outbound-call'
import {
  arg,
  effectiveCampaign,
  parseRouteArg,
  printRouteDryRun,
} from './dial-cli-shared'

async function main() {
  const campaignId = arg('campaign-id')
  const routeOverride = parseRouteArg(arg('route'))

  if (!campaignId) {
    console.error('Usage: npm run dial:route -- --campaign-id <id> [--route legacy|routr]')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('sip_trunk_id, routing_mode')
    .eq('id', campaignId)
    .single()

  if (cErr || !campaign) {
    console.error('Campaign not found:', cErr?.message ?? campaignId)
    process.exit(1)
  }

  const effective = effectiveCampaign(campaign, routeOverride)
  const trunk = await resolveTrunkWithSource(supabase, campaign, effective)
  printRouteDryRun(campaignId, trunk)
  process.exit(trunk.configError ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
