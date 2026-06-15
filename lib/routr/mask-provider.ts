import type { VoipProvider } from '@/lib/types/voip-provider'

export function maskProviderForClient(provider: VoipProvider): VoipProvider {
  return {
    ...provider,
    sip_password: provider.sip_password ? '********' : null,
    api_secret: provider.api_secret ? '********' : provider.api_secret,
  }
}
