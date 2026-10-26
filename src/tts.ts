import { FlowSpeechClient, FlowSpeechError, normalizeApiOrigin, rejectUnsupported, type FlowSpeechClientOptions } from './flowspeech-client.js'

export type FlowSpeechAudio = {
  audioBuffer: Buffer
  outputFormat: string
  fileExtension: string
  voiceCompatible: boolean
  requestId: string
  jobId: string
}
export function normalizeFlowSpeechBaseUrl(value?: string): string {
  const origin = normalizeApiOrigin(value)
  if (origin !== 'https://flowspeech.io') throw new FlowSpeechError('FlowSpeech baseUrl must target flowspeech.io', 'invalid_configuration')
  return origin
}
export async function synthesizeWithFlowSpeech(params: FlowSpeechClientOptions & {
  text: string
  apiKey: string
  voiceName: string
  /** No longer supported in v1; rejected explicitly. */
  prompt?: string
  timeoutMs: number
  requestId?: string
  signal?: AbortSignal
}): Promise<FlowSpeechAudio> {
  rejectUnsupported(params, ['text', 'apiKey', 'voiceName', 'baseUrl', 'timeoutMs', 'requestTimeoutMs', 'pollIntervalMs', 'maxRetries', 'maxAudioBytes', 'requestId', 'signal', 'fetch', 'headers'])
  const result = await new FlowSpeechClient({
    ...params,
    baseUrl: normalizeFlowSpeechBaseUrl(params.baseUrl),
    maxAudioBytes: params.maxAudioBytes ?? 16 * 1024 * 1024,
  }).generate({ mode: 'single', text: params.text, voiceName: params.voiceName }, { requestId: params.requestId, signal: params.signal })
  return {
    audioBuffer: Buffer.from(result.audio), outputFormat: 'wav', fileExtension: '.wav', voiceCompatible: false,
    jobId: result.job.id, requestId: result.requestId,
  }
}
