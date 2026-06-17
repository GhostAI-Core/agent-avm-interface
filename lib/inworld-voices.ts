/** Voice IDs — keep in sync with docs/voicelist.md */
const VOICE_IDS = [
  'default-hzau9tlenfqr0yc2k7co6g__female_anele_african',
  'default-hzau9tlenfqr0yc2k7co6g__female_catherine_white',
  'default-hzau9tlenfqr0yc2k7co6g__female_fiona_white',
  'default-hzau9tlenfqr0yc2k7co6g__female_jennifer_white_soft',
  'default-hzau9tlenfqr0yc2k7co6g__female_jessica_white_soft',
  'default-hzau9tlenfqr0yc2k7co6g__female_shannon_white',
  'default-hzau9tlenfqr0yc2k7co6g__male_frank_white',
  'default-hzau9tlenfqr0yc2k7co6g__male_bongani_african',
  'default-hzau9tlenfqr0yc2k7co6g__male_ashley_white',
  'default-hzau9tlenfqr0yc2k7co6g__male_alex_white',
  'default-hzau9tlenfqr0yc2k7co6g__male_abulele_african',
  'default-hzau9tlenfqr0yc2k7co6g__female_mamohau_african',
  'default-hzau9tlenfqr0yc2k7co6g__male_jacob_african',
  'default-hzau9tlenfqr0yc2k7co6g__female_tumi_african',
  'default-hzau9tlenfqr0yc2k7co6g__female_kudi_african',
  'default-hzau9tlenfqr0yc2k7co6g__male_rob_white',
  'default-hzau9tlenfqr0yc2k7co6g__male_kew_african',
] as const

export type VoiceGender = 'male' | 'female'
export type VoiceEthnicity = 'white' | 'african'

export interface InworldVoice {
  voiceId: string
  gender: VoiceGender
  ethnicity: VoiceEthnicity
  name: string
  variant: 'soft' | null
  label: string
  samplePath: string
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function parseVoiceId(voiceId: string): InworldVoice | null {
  const sep = voiceId.indexOf('__')
  if (sep === -1) return null

  const suffix = voiceId.slice(sep + 2)
  const parts = suffix.split('_')
  if (parts.length < 3) return null

  const gender = parts[0]
  if (gender !== 'male' && gender !== 'female') return null

  let ethnicity: string
  let name: string
  let variant: 'soft' | null = null

  if (parts[parts.length - 1] === 'soft') {
    variant = 'soft'
    ethnicity = parts[parts.length - 2]
    name = parts.slice(1, parts.length - 2).join('_')
  } else {
    ethnicity = parts[parts.length - 1]
    name = parts.slice(1, parts.length - 1).join('_')
  }

  if (ethnicity !== 'white' && ethnicity !== 'african') return null
  if (!name) return null

  const label = variant === 'soft' ? `${capitalize(name)} (Soft)` : capitalize(name)

  return {
    voiceId,
    gender,
    ethnicity,
    name,
    variant,
    label,
    samplePath: `/voice-samples/${suffix}.mp3`,
  }
}

function buildCatalog(): InworldVoice[] {
  const seen = new Set<string>()
  const voices: InworldVoice[] = []
  for (const id of VOICE_IDS) {
    if (seen.has(id)) continue
    seen.add(id)
    const parsed = parseVoiceId(id)
    if (parsed) voices.push(parsed)
  }
  return voices
}

export const INWORLD_VOICES = buildCatalog()

const GENDER_LABELS: Record<VoiceGender, string> = {
  male: 'Male',
  female: 'Female',
}

const ETHNICITY_LABELS: Record<VoiceEthnicity, string> = {
  white: 'White',
  african: 'African',
}

export function genderLabel(gender: VoiceGender): string {
  return GENDER_LABELS[gender]
}

export function ethnicityLabel(ethnicity: VoiceEthnicity): string {
  return ETHNICITY_LABELS[ethnicity]
}

export function genders(): VoiceGender[] {
  return [...new Set(INWORLD_VOICES.map(v => v.gender))].sort()
}

export function ethnicities(gender: VoiceGender): VoiceEthnicity[] {
  return [...new Set(INWORLD_VOICES.filter(v => v.gender === gender).map(v => v.ethnicity))].sort()
}

export function voices(gender: VoiceGender, ethnicity: VoiceEthnicity): InworldVoice[] {
  return INWORLD_VOICES.filter(v => v.gender === gender && v.ethnicity === ethnicity)
}

export function isValidVoiceId(id: string): boolean {
  return INWORLD_VOICES.some(v => v.voiceId === id)
}

export function findVoice(voiceId: string): InworldVoice | undefined {
  return INWORLD_VOICES.find(v => v.voiceId === voiceId)
}
