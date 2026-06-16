#!/usr/bin/env tsx
import './preload-env'

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRoutrClients, hostRoutrEndpoint } from '../lib/routr/client'
import { findCredentialsRefByName } from '../lib/routr/find-refs'
import { arg } from './dial-cli-shared'

const REQUIRED_ENV = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_SIP_ROUTR_TRUNK_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ROUTR_LIVEKIT_PEER_USERNAME',
  'ROUTR_LIVEKIT_PEER_PASSWORD',
  'ROUTR_OUTBOUND_CALLER_ID',
  'ROUTR_CARRIER_SIP_HOST',
  'ROUTR_CARRIER_SIP_USERNAME',
  'ROUTR_CARRIER_SIP_PASSWORD',
  'ROUTR_PUBLIC_IP',
] as const

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function step(title: string) {
  console.log(`\n── ${title} ──`)
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

function npmRun(script: string, args: string[] = []): void {
  run('npm', ['run', script, '--', ...args])
}

function requireEnv(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim())
  if (missing.length) {
    console.error('Missing required .env variables:')
    missing.forEach((k) => console.error(`  - ${k}`))
    process.exit(1)
  }
}

async function verifyRoutr(): Promise<void> {
  const callerId = process.env.ROUTR_OUTBOUND_CALLER_ID!.trim()
  const telUrl = `tel:${callerId.startsWith('+') ? callerId : `+${callerId.replace(/\D/g, '')}`}`

  const endpoint = hostRoutrEndpoint()
  const clients = createRoutrClients(endpoint)

  const { items: peers } = await clients.peers.listPeers({ pageSize: 50, pageToken: '' })
  console.log('Peers:')
  for (const p of peers ?? []) {
    console.log(`  ${p.ref}  ${p.name}  user=${p.username}`)
  }
  if (!peers?.length) {
    console.error('error: no Routr peers found')
    process.exit(1)
  }

  const livekit = peers.find((p) => p.name === 'LiveKit Cloud') ?? peers[0]
  const full = await clients.peers.getPeer(livekit.ref!)
  console.log(`\nLiveKit peer (${livekit.ref}):`)
  console.log(`  credentialsRef: ${full.credentialsRef ?? '(none)'}`)
  console.log(`  contactAddr:    ${full.contactAddr ?? '(none)'}`)
  if (process.env.ROUTR_PUBLIC_IP?.trim()) {
    console.log(`  UC whitelist IP: ${process.env.ROUTR_PUBLIC_IP.trim()} (ROUTR_PUBLIC_IP)`)
  }
  if (process.env.ROUTR_LIVEKIT_PEER_PASSWORD?.trim()) {
    const credRef = await findCredentialsRefByName(clients, 'LiveKit peer credentials')
    if (!full.credentialsRef) {
      console.error(
        'error: LiveKit peer has no credentialsRef (LiveKit trunk auth will fail). Run: npm run routr:bootstrap:rebuild',
      )
      if (credRef) console.error(`  credentials exist at ${credRef} but are not linked to the peer`)
      process.exit(1)
    }
  }

  const { items: numbers } = await clients.numbers.listNumbers({ pageSize: 50, pageToken: '' })
  console.log('\nNumbers:')
  for (const n of numbers ?? []) {
    console.log(`  ${n.ref}  ${n.name}  ${n.telUrl}`)
  }
  if (!numbers?.some((n) => n.telUrl === telUrl)) {
    console.error(`error: no Number for ${telUrl} (ROUTR_OUTBOUND_CALLER_ID=${callerId})`)
    console.error('  Run: npm run routr:bootstrap  (or npm run routr:bootstrap:rebuild)')
    process.exit(1)
  }

  const { items: trunks } = await clients.trunks.listTrunks({ pageSize: 50, pageToken: '' })
  console.log('\nTrunks:')
  for (const t of trunks ?? []) {
    console.log(`  ${t.ref}  ${t.name}  ${t.inboundUri}  sendRegister=${t.sendRegister}`)
  }
  if (!trunks?.length) {
    console.error('error: no Routr trunks found')
    process.exit(1)
  }

  console.log(`\nRoutr API endpoint: ${endpoint}`)
}

function usage(): never {
  console.log(`
Usage (from repo root):
  npm run test:routr -- --campaign-id <id> --phone <e164>

Individual steps:
  npm run routr:bootstrap
  npm run routr:bootstrap:rebuild
  npm run routr:verify
  npm run dial:route -- --campaign-id <id> --route routr
  npm run dial -- --campaign-id <id> --phone <e164> --route routr --wait

Options:
  --campaign-id <id>   Required
  --phone <e164>       Required unless --skip-dial
  --skip-bootstrap     Skip npm run routr:bootstrap
  --skip-verify        Skip Routr SDK checks
  --skip-dial          Stop after dial:route dry-run
  --rebuild-bootstrap  npm run routr:bootstrap:rebuild
  --no-wait            Dial without --wait
  --install-deps       Run npm ci first
`)
  process.exit(1)
}

async function main() {
  if (hasFlag('help')) usage()

  const campaignId = arg('campaign-id')
  const phone = arg('phone')
  const skipBootstrap = hasFlag('skip-bootstrap')
  const skipVerify = hasFlag('skip-verify')
  const skipDial = hasFlag('skip-dial')
  const rebuildBootstrap = hasFlag('rebuild-bootstrap')
  const waitForAnswer = !hasFlag('no-wait')
  const installDeps = hasFlag('install-deps')

  if (!campaignId) usage()
  if (!skipDial && !phone) {
    console.error('error: --phone is required (or pass --skip-dial)')
    usage()
  }

  if (!existsSync(join(process.cwd(), 'package.json'))) {
    console.error('error: run from repo root (where package.json lives), not scripts/')
    process.exit(1)
  }

  step('1. Environment')
  requireEnv()
  console.log('campaign_id:        ', campaignId)
  console.log('phone:              ', phone ?? '(skip dial)')
  console.log('routr_trunk:        ', process.env.LIVEKIT_SIP_ROUTR_TRUNK_ID)
  console.log('outbound_caller_id: ', process.env.ROUTR_OUTBOUND_CALLER_ID)

  step('2. Node dependencies')
  if (installDeps || !existsSync(join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))) {
    console.log('Running npm ci...')
    run('npm', ['ci'])
  } else {
    console.log('node_modules present (pass --install-deps to force npm ci)')
  }

  if (!skipBootstrap) {
    step('3. Routr bootstrap')
    if (rebuildBootstrap) {
      npmRun('routr:bootstrap:rebuild')
    } else {
      npmRun('routr:bootstrap')
    }
  } else {
    step('3. Routr bootstrap (skipped)')
  }

  if (!skipVerify) {
    step('4. Routr verify')
    await verifyRoutr()
  } else {
    step('4. Routr verify (skipped)')
  }

  step('5. Dial dry-run')
  npmRun('dial:route', ['--campaign-id', campaignId!, '--route', 'routr'])

  if (skipDial) {
    step('6. Live dial (skipped)')
    console.log('\nDone (dry-run only).')
    return
  }

  step('6. Live dial')
  const dialArgs = ['--campaign-id', campaignId!, '--phone', phone!, '--route', 'routr']
  if (waitForAnswer) dialArgs.push('--wait')
  npmRun('dial', dialArgs)

  console.log('\nDone. On failure: docker compose logs -f agent-avm-sip-routr')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
