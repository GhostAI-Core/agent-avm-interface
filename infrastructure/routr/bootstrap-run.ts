#!/usr/bin/env node
import { runBootstrapFromEnv } from '../../lib/routr/sync-all'

const log = (msg: string) => {
  const line = msg.startsWith('[') ? msg : `[routr-bootstrap] ${msg}`
  console.log(line)
}

runBootstrapFromEnv(log)
  .then(() => {
    console.log('[routr-bootstrap] done')
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[routr-bootstrap] ERROR:', message)
    process.exit(1)
  })
