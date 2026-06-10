import type { Campaign, CampaignReport, CallRecord, IntentStat, IntentWaterfall } from '@/types'

export const DEMO_CAMPAIGNS: Campaign[] = [
  { id:1, name:'1Life BMI AI V4.2',               agent:'seeker',  company:'1Life',        status:'running', dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:2, name:'1Life Funeral BMI AI V4.3',        agent:'grace',   company:'1Life',        status:'running', dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
  { id:3, name:'3Way Miway STI AI NEW',            agent:'sangoma', company:'Miway',        status:'running', dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:4, name:'Miway STI UGOC AI V4.3 Male',      agent:'seeker',  company:'Miway',        status:'paused',  dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:5, name:'Ivyze STI Old Mutual Vantage Male', agent:'grace',   company:'Old Mutual',   status:'running', dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
  { id:6, name:'Metropolitan Funeral UGOC AI V4.3', agent:'sangoma', company:'Metropolitan', status:'paused',  dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
]

export const DEMO_REPORTS: CampaignReport[] = [
  { id:1, campaign_id:1, phone_number:'+27 82 123 4567', status:'connected', dialed:117728, connected:17853, qualified:43,  voicemail:30568, no_speech:10668, hangup:14137, ni:188,  dnq:170, callback:62,  no_answer:36189,  busy_line:11052, failed:14545, duration:'101:03:03', cpl:35.96,  total_spent:1546.08,  campaign:{name:'1Life BMI AI V4.2',               agent:'seeker'}  },
  { id:2, campaign_id:2, phone_number:'+27 71 987 6543', status:'voicemail', dialed:117190, connected:18223, qualified:59,  voicemail:30528, no_speech:10778, hangup:10666, ni:209,  dnq:144, callback:64,  no_answer:35907,  busy_line:11230, failed:13741, duration:'102:37:16', cpl:26.61,  total_spent:1570.10,  campaign:{name:'1Life Funeral BMI AI V4.3',        agent:'grace'}   },
  { id:3, campaign_id:3, phone_number:'+27 63 456 7890', status:'no_answer', dialed:112004, connected:21020, qualified:32,  voicemail:29420, no_speech:8928,  hangup:17612, ni:302,  dnq:79,  callback:119, no_answer:27639,  busy_line:8644,  failed:19141, duration:'124:14:20', cpl:59.40,  total_spent:1900.86,  campaign:{name:'3Way Miway STI AI NEW',            agent:'sangoma'} },
  { id:4, campaign_id:4, phone_number:'+27 83 321 0987', status:'connected', dialed:348886, connected:64408, qualified:48,  voicemail:63267, no_speech:38064, hangup:47766, ni:405,  dnq:113, callback:112, no_answer:121703, busy_line:44834, failed:32335, duration:'298:42:55', cpl:95.22,  total_spent:4570.34,  campaign:{name:'Miway STI UGOC AI V4.3 Male',      agent:'seeker'}  },
  { id:5, campaign_id:5, phone_number:'+27 72 654 3210', status:'connected', dialed:242162, connected:41806, qualified:30,  voicemail:71316, no_speech:17844, hangup:36020, ni:2189, dnq:291, callback:680, no_answer:53673,  busy_line:21409, failed:38568, duration:'254:43:36', cpl:129.91, total_spent:3897.32,  campaign:{name:'Ivyze STI Old Mutual Vantage Male', agent:'grace'}   },
  { id:6, campaign_id:6, phone_number:'+27 61 789 0123', status:'hangup',    dialed:121468, connected:19418, qualified:66,  voicemail:28875, no_speech:11360, hangup:15473, ni:330,  dnq:125, callback:101, no_answer:39271,  busy_line:12428, failed:13359, duration:'132:16:42', cpl:30.66,  total_spent:2023.86,  campaign:{name:'Metropolitan Funeral UGOC AI V4.3', agent:'sangoma'} },
]

export const DEMO_SECURITY_LOGS = [
  { id: 1, event_type: 'login', agent_name: 'Admin', ip_address: '192.168.1.10', details: 'Successful 2FA verification from Desktop-SA-01', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, event_type: 'config_change', agent_name: 'Admin', ip_address: '192.168.1.10', details: 'Updated dialing speed to 2x for campaign "1Life BMI"', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 3, event_type: 'unauthorized_access', agent_name: 'Unknown', ip_address: '45.12.33.104', details: 'Blocked attempt to access /api/providers from non-whitelisted IP', created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, event_type: 'login', agent_name: 'Voice Engineer', ip_address: '10.0.0.45', details: 'Biometric Face ID authentication successful', created_at: new Date(Date.now() - 90000000).toISOString() },
  { id: 5, event_type: 'config_change', agent_name: 'Voice Engineer', ip_address: '10.0.0.45', details: 'Switched environment to Staging for "Life Cover AI"', created_at: new Date(Date.now() - 120000000).toISOString() },
]

// Per-campaign individual call records — deterministic fallback (seeded by campaign id)
// used when the call_records table isn't reachable. Mirrors the SQL seed's distribution.
const CALL_OUTCOMES: { outcome: string; threshold: number }[] = [
  { outcome: 'qualified', threshold: 0.02 },
  { outcome: 'connected', threshold: 0.20 },
  { outcome: 'voicemail', threshold: 0.45 },
  { outcome: 'no_speech', threshold: 0.55 },
  { outcome: 'hangup',    threshold: 0.68 },
  { outcome: 'callback',  threshold: 0.72 },
  { outcome: 'ni',        threshold: 0.74 },
  { outcome: 'dnq',       threshold: 0.76 },
  { outcome: 'no_answer', threshold: 0.88 },
  { outcome: 'busy',      threshold: 0.94 },
  { outcome: 'failed',    threshold: 1.01 },
]

function talkFor(outcome: string, rnd: number): number {
  switch (outcome) {
    case 'qualified': return 120 + Math.floor(rnd * 240)
    case 'connected': return 30 + Math.floor(rnd * 180)
    case 'callback':  return 20 + Math.floor(rnd * 60)
    case 'voicemail': return 5 + Math.floor(rnd * 25)
    case 'no_speech': return 3 + Math.floor(rnd * 12)
    case 'ni':        return 10 + Math.floor(rnd * 40)
    case 'dnq':       return 10 + Math.floor(rnd * 30)
    case 'hangup':    return 1 + Math.floor(rnd * 8)
    default:          return 0
  }
}

export function demoCallsFor(campaignId: number, count = 60): CallRecord[] {
  let seed = ((campaignId || 1) * 7919) & 0x7fffffff
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const now = Date.now()
  const calls: CallRecord[] = []
  for (let i = 0; i < count; i++) {
    const r = rand()
    const outcome = CALL_OUTCOMES.find(o => r < o.threshold)!.outcome
    const talk = talkFor(outcome, rand())
    const phone = `+27 ${60 + Math.floor(rand() * 30)} ${String(Math.floor(rand() * 1000)).padStart(3, '0')} ${String(Math.floor(rand() * 10000)).padStart(4, '0')}`
    calls.push({
      id: campaignId * 1000 + i,
      campaign_id: campaignId,
      phone,
      outcome,
      talk_seconds: talk,
      cost: Math.round((talk * 0.15 + 0.5) * 100) / 100,
      transferred: outcome === 'qualified' && rand() < 0.6,
      recording_url: talk > 0 ? `https://recordings.local/${campaignId}/${i}.mp3` : null,
      called_at: new Date(now - Math.floor(rand() * 14 * 24 * 3600 * 1000)).toISOString(),
    })
  }
  return calls.sort((a, b) => +new Date(b.called_at) - +new Date(a.called_at))
}

// Intent waterfall — deterministic per campaign + date, used when intent_stats
// isn't reachable. Mirrors the SQL seed's decaying-by-step distribution.
const INTENT_FLOW: string[] = [
  'Greeting', 'Hello', 'Intro', 'CallPositioning', 'AlreadyCoveredHandling',
  'CanIContinue', 'CallbackHandling', 'CallbackGoodbye', 'DidNotQualify', 'FallbackGoodbye',
  'NotInterestedHandling', 'NotInterestedGoodbye', 'UnemployedGoodbye', 'PopiInfo', 'WhoYou',
  'QuesRSA', 'QuesAge', 'QuesSalary', 'FinalContinue', 'QualifiedGoodbye',
]

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function demoIntentsFor(campaignId: number, date: string): IntentWaterfall {
  let seed = (((campaignId || 1) * 7919) ^ hashStr(date || '')) >>> 0
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 0xffffffff }
  const connectedTotal = 4000 + Math.floor(rand() * 8000)
  const intents: IntentStat[] = INTENT_FLOW.map((intent_name, idx) => {
    const step = idx + 1
    const reached = Math.max(0, Math.floor((1500 / step) * (0.5 + rand())))
    return { intent_name, step, reached }
  })
  return { day: date, connectedTotal, intents }
}
