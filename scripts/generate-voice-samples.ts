import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'fs'
import { INWORLD_VOICES } from '../lib/inworld-voices'

config()

const TEXT = `Hi, this is a quick voice demo for this AI voice.

This voice can be used for outbound calls, customer support, appointment reminders, and marketing messages.

It is designed to sound clear, natural, and easy to understand over the phone.`

const apiKey = process.env.INWORLD_API_KEY?.trim().replace(/^"|"$/g, '')
if (!apiKey) {
  console.error('INWORLD_API_KEY is not set in .env')
  process.exit(1)
}

mkdirSync('public/voice-samples', { recursive: true })

let ok = 0
let fail = 0

async function main() {
const only = process.argv.slice(2)
const voices = only.length
  ? INWORLD_VOICES.filter(v => only.some(s => v.voiceId.endsWith(s) || v.voiceId.includes(`__${s}`)))
  : INWORLD_VOICES

for (const voice of voices) {
  const suffix = voice.voiceId.split('__')[1]
  const outPath = `public/voice-samples/${suffix}.mp3`
  process.stdout.write(`Generating ${suffix}... `)

  try {
    const res = await fetch('https://api.inworld.ai/tts/v1/voice', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: TEXT,
        voiceId: voice.voiceId,
        modelId: 'inworld-tts-1.5-max',
        timestampType: 'WORD',
        deliveryMode: 'STABLE',
        applyTextNormalization: 'ON',
        audioConfig: { speakingRate: 1.2 },
        temperature: 1.4,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.log(`FAILED (${res.status})`)
      console.error(err.slice(0, 300))
      fail++
      continue
    }

    const data = (await res.json()) as { audioContent?: string }
    if (!data.audioContent) {
      console.log('FAILED (no audioContent)')
      fail++
      continue
    }

    const buf = Buffer.from(data.audioContent, 'base64')
    writeFileSync(outPath, buf)
    console.log(`OK (${(buf.length / 1024).toFixed(1)} KB)`)
    ok++
  } catch (e) {
    console.log('FAILED (error)')
    console.error(e)
    fail++
  }
}

console.log(`\nDone: ${ok} saved, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
