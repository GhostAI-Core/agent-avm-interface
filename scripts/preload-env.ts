/**
 * Load .env before any module reads process.env at import time.
 * Must be the first import in CLI scripts.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })
