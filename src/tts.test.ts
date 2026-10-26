import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeFlowSpeechBaseUrl, synthesizeWithFlowSpeech } from './tts.js'
import { audio, job, jobId, json, requestId, wav } from '../tests/fixtures.js'
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const params = { apiKey: 'unit-test-only', text: 'Hello', voiceName: 'Kore', timeoutMs: 60_000, requestId }
describe('OpenClaw TTS helper', () => {
  it('submits, polls, and downloads actual WAV with OpenClaw metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(job('queued'), 202)).mockResolvedValueOnce(json(job())).mockResolvedValueOnce(audio())
    const pending = synthesizeWithFlowSpeech({ ...params, fetch: fetcher })
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toEqual({ audioBuffer: wav(), outputFormat: 'wav', fileExtension: '.wav', voiceCompatible: false, jobId, requestId })
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ input: { mode: 'single', text: 'Hello', voiceName: 'Kore' } })
    expect(fetcher.mock.calls[2]![1]?.headers).toBeUndefined()
  })
  it('rejects legacy prompts before submitting', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(synthesizeWithFlowSpeech({ ...params, fetch: fetcher, prompt: 'Calm' })).rejects.toMatchObject({ code: 'unsupported_option' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['http://flowspeech.io', 'https://flowspeech.io.example.com', 'https://name:pass@flowspeech.io', 'https://flowspeech.io/custom-path', 'https://flowspeech.io?token=oops'])('rejects unsafe official origin %s', url => {
    expect(() => normalizeFlowSpeechBaseUrl(url)).toThrow()
  })
  it('supports explicit caller cancellation without cancelling the server job', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(job('queued')))
    const assertion = expect(synthesizeWithFlowSpeech({ ...params, fetch: fetcher, signal: controller.signal })).rejects.toMatchObject({ code: 'aborted', jobId, requestId })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
