import assert from 'node:assert/strict'
import { resolveTtsConfig, testApi } from 'openclaw/plugin-sdk/tts-runtime'
import { validWav } from './wav-fixtures.mjs'

const key = 'unit-test-only'
const jobId = '22222222-2222-4222-8222-222222222222'
const url = 'https://audio.example.test/audio.wav?signature=private-fixture'
const policy = { enabled: true, allowText: true, allowProvider: true, allowVoice: true, allowModelId: true, allowVoiceSettings: true, allowNormalization: true, allowSeed: true }
const normalize = raw => resolveTtsConfig({ messages: { tts: { providers: { flowspeech: raw } } } }).providerConfigs.flowspeech
function hostConfig(provider, raw) {
  const resolved = provider.resolveConfig({ cfg: {}, timeoutMs: 1000,
    rawConfig: { providers: { flowspeech: normalize(raw) } } })
  return normalize(resolved)
}
function parse(provider, body, overrides = {}, other = undefined) {
  return testApi.parseTtsDirectives(body, { ...policy, ...overrides }, { providers: other ? [provider, other] : [provider] })
}
function finished(requestId, status = 'success') {
  return { id: jobId, requestId, status,
    usage: { billableCharacters: 5, reservedCredits: 0, chargedCredits: 5 },
    result: status === 'success' ? { url, mimeType: 'audio/wav', sampleRate: 24000, channels: 1, bitsPerSample: 16 } : null }
}
const json = value => new Response(JSON.stringify(value))
async function withFetch(handler, run) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return handler(url, init, calls.length) }
  try { return await run(calls) } finally { globalThis.fetch = previous }
}
async function synthesize(provider, config, overrides = undefined, handler = undefined, timeoutMs = 1000) {
  return withFetch(handler ?? ((_url, init) => init.method === 'POST'
    ? json(finished(new Headers(init.headers).get('idempotency-key'))) : new Response(new Uint8Array(validWav()))),
  async calls => {
    const audio = await provider.synthesize({ text: 'Hello', cfg: {}, providerConfig: config,
      providerOverrides: overrides, target: 'audio-file', timeoutMs })
    assert.deepEqual(audio.audioBuffer, validWav())
    assert.equal(audio.fileExtension, '.wav')
    assert.equal(audio.voiceCompatible, false)
    assert.equal(calls.length, 2)
    assert.equal(calls[1][1].headers, undefined)
    assert.equal(calls[1][1].credentials, 'omit')
    assert.equal(calls[1][1].redirect, 'manual')
    return JSON.parse(calls[0][1].body).input
  })
}

// Uses the installed host's public resolver, directive parser and error renderer.
export function hostContractCases(buildProvider) {
  const cases = []
  for (const [name, raw, expected] of [
    ['default', {}, 'Kore'], ['voiceName', { voiceName: 'Puck' }, 'Puck'],
    ['voice', { voice: 'Puck' }, 'Puck'], ['speakerVoice', { speakerVoice: 'Puck' }, 'Puck'],
    ['canonical precedence', { speakerVoice: 'Kore', voice: 'Puck', voiceName: 'Aoede' }, 'Kore'],
  ]) cases.push(['host-normalized config: ' + name, async () => {
    const provider = buildProvider()
    const config = hostConfig(provider, { apiKey: key, ...raw })
    assert.equal(config.speakerVoice, expected); assert.equal(config.voice, expected); assert.equal(config.voiceName, expected)
    assert.equal(provider.isConfigured({ providerConfig: config, timeoutMs: 1000 }), true)
    assert.deepEqual(await synthesize(provider, config), { mode: 'single', text: 'Hello', voiceName: expected })
  }])
  for (const directive of ['speaker_voice=Puck', 'voice=Puck', 'voice_name=Puck', 'speaker_voice=Kore flowspeech_voice=Puck']) {
    cases.push(['host voice directive: ' + directive, async () => {
      const provider = buildProvider()
      const parsed = parse(provider, '[[tts:provider=flowspeech ' + directive + ']] Hello')
      assert.deepEqual(parsed.warnings, [])
      const overrides = parsed.overrides.providerOverrides.flowspeech
      assert.equal(overrides.voiceName, 'Puck')
      assert.equal(overrides.speakerVoice, 'Puck')
      const input = await synthesize(provider, hostConfig(provider, { apiKey: key }), overrides)
      assert.equal(input.voiceName, 'Puck')
      assert.deepEqual(Object.keys(input).sort(), ['mode', 'text', 'voiceName'])
    }])
  }
  for (const directive of ['style', 'prompt', 'emotion']) cases.push(['host unsupported directive warning: ' + directive, async () => {
    const provider = buildProvider()
    const text = '[[tts:provider=flowspeech ' + directive + '=private-fixture]] Hello'
    const parsed = parse(provider, text)
    assert.equal(parsed.cleanedText.trim(), 'Hello')
    assert.equal(parsed.warnings.length, 1)
    assert.match(parsed.warnings[0], /does not support/)
    assert.ok(!parsed.warnings[0].includes('private-fixture'))
    assert.equal(parsed.overrides.providerOverrides?.flowspeech?.[directive], undefined)
    assert.deepEqual(parse(provider, text, { allowVoiceSettings: false }).warnings, [])
    assert.equal(parse(provider, text, { enabled: false }).cleanedText, text)
    const other = { id: 'other', label: 'Other', parseDirectiveToken: () => ({ handled: true, overrides: { style: 'Other' } }) }
    const selectedOther = parse(provider, '[[tts:provider=other ' + directive + '=Calm]] Hello', {}, other)
    assert.deepEqual(selectedOther.warnings, [])
    assert.equal(selectedOther.overrides.providerOverrides.other.style, 'Other')
  }])
  cases.push(['host voice policy disables overrides', async () => {
    const provider = buildProvider()
    const parsed = parse(provider, '[[tts:provider=flowspeech speaker_voice=Puck flowspeech_voice=Aoede]] Hello', { allowVoice: false })
    assert.equal(parsed.overrides.providerOverrides, undefined)
  }])
  for (const failure of ['timeout', 'download', 'invalid WAV', 'lost create response']) cases.push(['host error renderer preserves recovery IDs: ' + failure, async () => {
    const provider = buildProvider()
    let requestId
    const config = hostConfig(provider, { apiKey: key, maxRetries: 0 })
    await withFetch((_url, init) => {
      if (init.method === 'POST') {
        requestId = new Headers(init.headers).get('idempotency-key')
        if (failure === 'lost create response') throw new Error(key + ' ' + url)
        return json(finished(requestId, failure === 'timeout' ? 'queued' : 'success'))
      }
      if (failure === 'download') return new Response(key + ' ' + url, { status: 404 })
      return new Response('<html>' + key + ' ' + url + '</html>')
    }, async calls => {
      let caught
      try { await provider.synthesize({ text: 'Hello', cfg: {}, providerConfig: config, target: 'audio-file', timeoutMs: failure === 'timeout' ? 30 : 1000 }) }
      catch (error) { caught = error }
      assert.ok(caught instanceof Error)
      const rendered = testApi.formatTtsProviderError('flowspeech', caught)
      assert.equal(caught.requestId, requestId)
      assert.ok(rendered.includes('requestId=' + requestId), rendered)
      if (failure !== 'lost create response') {
        assert.equal(caught.jobId, jobId)
        assert.ok(rendered.includes('jobId=' + jobId), rendered)
      } else assert.ok(!rendered.includes('jobId='))
      assert.ok(!rendered.includes(key))
      assert.ok(!rendered.includes(url))
      assert.ok(!rendered.includes('private-fixture'))
      assert.equal(calls.filter(([, init]) => init.method === 'POST').length, 1)
    })
  }])
  return cases
}
