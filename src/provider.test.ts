import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechModelOverridePolicy } from 'openclaw/plugin-sdk/speech'
import plugin from './index.js'
import { buildFlowSpeechProvider } from './provider.js'
import { audio, job, jobId, json, wav } from '../tests/fixtures.js'
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('FLOWSPEECH_API_KEY', '') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('OpenClaw speech provider contract', () => {
  it('registers the provider through the public plugin entry', () => {
    const registerSpeechProvider = vi.fn()
    plugin.register?.({ registerSpeechProvider } as never)
    expect(registerSpeechProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'flowspeech', synthesize: expect.any(Function) }))
  })
  it('validates configuration and still discovers voices without credentials', async () => {
    const provider = buildFlowSpeechProvider()
    expect(provider.isConfigured?.({ providerConfig: { apiKey: 'unit-test-only' }, timeoutMs: 5000 })).toBe(true)
    expect(provider.isConfigured?.({ providerConfig: {}, timeoutMs: 5000 })).toBe(false)
    expect(provider.isConfigured?.({ providerConfig: { apiKey: 'unit-test-only', baseUrl: 'https://elsewhere.example.test' }, timeoutMs: 5000 })).toBe(false)
    expect((await provider.listVoices?.({}))?.map(v => v.id)).toContain('Kore')
    expect((await provider.listVoices?.({}))?.length).toBe(30)
  })
  it('uses the host deadline for polling and keeps WAV file compatibility', async () => {
    let requestId: string | null = null
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async (_url, init) => {
        requestId = new Headers(init?.headers).get('idempotency-key')
        return json(job('queued', { requestId }))
      })
      .mockImplementationOnce(async () => json(job('success', { requestId })))
      .mockResolvedValueOnce(audio())
    vi.stubGlobal('fetch', fetcher)
    const pending = buildFlowSpeechProvider().synthesize!({ text: 'Hello', cfg: {}, providerConfig: { apiKey: 'unit-test-only', voiceName: 'Puck' }, target: 'audio-file', timeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toMatchObject({ audioBuffer: wav(), fileExtension: '.wav', voiceCompatible: false, jobId, requestId })
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).input.voiceName).toBe('Puck')
  })
  it('fails at the host timeout while retaining recovery IDs', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) =>
      json(job('queued', { requestId: new Headers(init?.headers).get('idempotency-key') }))))
    const assertion = expect(buildFlowSpeechProvider().synthesize!({ text: 'Hello', cfg: {}, providerConfig: { apiKey: 'unit-test-only' }, target: 'audio-file', timeoutMs: 100 })).rejects.toMatchObject({ code: 'deadline_exceeded', jobId, requestId: expect.any(String) })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })
  it('rejects unsupported config and voice-setting directives instead of ignoring them', async () => {
    const provider = buildFlowSpeechProvider()
    await expect(provider.synthesize!({ text: 'Hello', cfg: {}, providerConfig: { apiKey: 'unit-test-only', prompt: 'Calm' }, target: 'audio-file', timeoutMs: 100 })).rejects.toMatchObject({ code: 'unsupported_option' })
    const policy = { allowVoice: true, allowVoiceSettings: true } as SpeechModelOverridePolicy
    expect(provider.parseDirectiveToken?.({ key: 'voice', value: 'Puck', policy })).toMatchObject({ handled: true, overrides: { voiceName: 'Puck' } })
    expect(provider.parseDirectiveToken?.({ key: 'style', value: 'Calm', policy })).toMatchObject({ handled: true, warnings: [expect.stringContaining('does not support')] })
    expect(provider.parseDirectiveToken?.({ key: 'style', value: 'Calm', policy: { ...policy, allowVoiceSettings: false } })).toEqual({ handled: true })
  })
})
