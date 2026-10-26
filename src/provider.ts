import { normalizeResolvedSecretInputString } from 'openclaw/plugin-sdk/secret-input'
import type { SpeechDirectiveTokenParseContext, SpeechProviderConfig, SpeechProviderPlugin } from 'openclaw/plugin-sdk/speech'
import { trimToUndefined } from 'openclaw/plugin-sdk/speech-core'
import { synthesizeWithFlowSpeech, normalizeFlowSpeechBaseUrl } from './tts.js'
import { FlowSpeechClient, FlowSpeechError, rejectUnsupported, type FlowSpeechClientOptions } from './flowspeech-client.js'
import { FLOWSPEECH_VOICES } from './voices.js'

type Config = FlowSpeechClientOptions & { voiceName: string; baseUrl: string }
const voiceKeys = ['speakerVoice', 'voice', 'voiceName'] as const
const configKeys = ['apiKey', 'baseUrl', ...voiceKeys, 'requestTimeoutMs', 'pollIntervalMs', 'maxRetries', 'maxAudioBytes']
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function readVoice(raw: SpeechProviderConfig): string | undefined {
  for (const key of voiceKeys) {
    if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !raw[key].trim())) {
      throw new FlowSpeechError('Invalid FlowSpeech voice selection', 'invalid_configuration')
    }
  }
  // Match OpenClaw's canonical speaker selection precedence.
  for (const key of voiceKeys) if (typeof raw[key] === 'string') return raw[key].trim()
  return undefined
}
function readConfig(raw: SpeechProviderConfig): Config {
  rejectUnsupported(raw, configKeys)
  const result: Config = {
    apiKey: normalizeResolvedSecretInputString({ value: raw.apiKey, path: 'tts.providers.flowspeech.apiKey' }),
    baseUrl: normalizeFlowSpeechBaseUrl(raw.baseUrl as string | undefined),
    voiceName: readVoice(raw) ?? 'Kore',
  }
  for (const key of ['requestTimeoutMs', 'pollIntervalMs', 'maxRetries', 'maxAudioBytes'] as const) {
    if (raw[key] !== undefined) result[key] = raw[key] as number
  }
  return result
}
function resolveApiKey(value: unknown): string | undefined {
  return value === undefined ? process.env.FLOWSPEECH_API_KEY : value as string
}
function parseDirectiveToken(ctx: SpeechDirectiveTokenParseContext) {
  switch (ctx.key) {
    case 'voice': case 'voice_name': case 'voicename': case 'flowspeech_voice':
      if (!ctx.policy.allowVoice) return { handled: true }
      return { handled: true, overrides: { ...ctx.currentOverrides, speakerVoice: ctx.value, voice: ctx.value, voiceName: ctx.value } }
    case 'prompt': case 'style': case 'emotion':
      if (!ctx.policy.allowVoiceSettings) return { handled: true }
      return { handled: true, warnings: ['FlowSpeech v1 does not support separate style/prompt/emotion directives; directive ignored'] }
    default: return { handled: false }
  }
}
export function buildFlowSpeechProvider(): SpeechProviderPlugin {
  return {
    id: 'flowspeech', label: 'FlowSpeech', autoSelectOrder: 40,
    voices: FLOWSPEECH_VOICES.map(voice => voice.id),
    resolveConfig: ({ rawConfig }) => {
      const providers = asRecord(rawConfig.providers)
      return { ...readConfig(asRecord(providers?.flowspeech) ?? asRecord(rawConfig.flowspeech) ?? {}) }
    },
    parseDirectiveToken,
    // Offline discovery remains available before a key is configured. Use the client for the live catalog.
    listVoices: async () => FLOWSPEECH_VOICES.map(voice => ({ id: voice.id, name: voice.id, description: voice.description, gender: voice.gender })),
    isConfigured: ({ providerConfig }) => {
      try {
        const config = readConfig(providerConfig)
        new FlowSpeechClient({ ...config, apiKey: resolveApiKey(config.apiKey) })
        return !!trimToUndefined(config.voiceName)
      } catch { return false }
    },
    synthesize: async req => {
      const config = readConfig(req.providerConfig)
      const apiKey = resolveApiKey(config.apiKey)
      if (!apiKey) throw new FlowSpeechError('FlowSpeech API key missing', 'invalid_configuration')
      rejectUnsupported(req.providerOverrides ?? {}, voiceKeys)
      const voiceName = readVoice(req.providerOverrides ?? {}) ?? config.voiceName
      try {
        return await synthesizeWithFlowSpeech({ ...config, apiKey, text: req.text, voiceName, timeoutMs: req.timeoutMs })
      } catch (error) {
        // The host retains only Error.message, so recovery IDs must survive there.
        if (error instanceof FlowSpeechError) {
          const ids = (['requestId', 'jobId'] as const).flatMap(key => {
            const value = error[key]
            return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
              ? [key + '=' + value] : []
          })
          if (ids.length) error.message += '; recovery: ' + ids.join(', ')
        }
        throw error
      }
    },
  }
}
