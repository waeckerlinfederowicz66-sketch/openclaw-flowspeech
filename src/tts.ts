import { pcm16ToWav, parseSampleRate } from "./audio.js";

const FLOWSPEECH_HOSTNAME = "flowspeech.io";
const DEFAULT_BASE_URL = "https://flowspeech.io";
const DEFAULT_MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_JSON_CHARS = 24 * 1024 * 1024;

type FlowSpeechResponse = {
  code?: number;
  message?: string;
  data?: {
    audioBase64?: string;
    mimeType?: string;
    sampleRate?: number;
    numChannels?: number;
    bitsPerSample?: number;
  };
};

export type FlowSpeechAudio = {
  audioBuffer: Buffer;
  outputFormat: string;
  fileExtension: string;
  voiceCompatible: boolean;
};

export function normalizeFlowSpeechBaseUrl(value?: string): string {
  const url = new URL(value?.trim() || DEFAULT_BASE_URL);
  if (url.protocol !== "https:") {
    throw new Error("FlowSpeech baseUrl must use https");
  }
  if (url.hostname !== FLOWSPEECH_HOSTNAME || url.username || url.password || url.port) {
    throw new Error("FlowSpeech baseUrl must target flowspeech.io");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("FlowSpeech baseUrl must not include a path");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function decodeBase64(value: string, maxBytes: number): Buffer {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("FlowSpeech returned invalid Base64 audio");
  }
  const estimatedBytes = Math.floor((normalized.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new Error(`FlowSpeech audio response exceeds ${maxBytes} bytes`);
  }
  const audio = Buffer.from(normalized, "base64");
  if (!audio.length) {
    throw new Error("FlowSpeech returned empty audio");
  }
  return audio;
}

function formatError(payload: FlowSpeechResponse | undefined, status: number): string {
  const detail = payload?.message?.trim().slice(0, 500);
  return detail ? `FlowSpeech API error (${status}): ${detail}` : `FlowSpeech API error (${status})`;
}

export async function synthesizeWithFlowSpeech(params: {
  text: string;
  apiKey: string;
  voiceName: string;
  prompt?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxAudioBytes?: number;
}): Promise<FlowSpeechAudio> {
  const baseUrl = normalizeFlowSpeechBaseUrl(params.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/ai/text-to-speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: params.text,
        originalText: params.text,
        speakers: [{ voiceName: params.voiceName }],
        ...(params.prompt ? { prompt: params.prompt } : {}),
      }),
      signal: controller.signal,
      redirect: "error",
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  if (body.length > MAX_JSON_CHARS) {
    throw new Error("FlowSpeech API response is too large");
  }

  let payload: FlowSpeechResponse | undefined;
  try {
    payload = JSON.parse(body) as FlowSpeechResponse;
  } catch {
    if (!response.ok) throw new Error(formatError(undefined, response.status));
    throw new Error("FlowSpeech returned malformed JSON");
  }

  if (!response.ok || payload.code !== 0) {
    throw new Error(formatError(payload, response.status));
  }

  const data = payload.data;
  if (!data?.audioBase64) {
    throw new Error("FlowSpeech response did not include audioBase64");
  }

  const mimeType = data.mimeType?.trim() || "audio/wav";
  const rawAudio = decodeBase64(data.audioBase64, params.maxAudioBytes ?? DEFAULT_MAX_AUDIO_BYTES);

  if (/^audio\/(?:l16|pcm)(?:;|$)/i.test(mimeType)) {
    const sampleRate = data.sampleRate ?? parseSampleRate(mimeType) ?? 24_000;
    const channels = data.numChannels ?? 1;
    const bitsPerSample = data.bitsPerSample ?? 16;
    return {
      audioBuffer: pcm16ToWav(rawAudio, sampleRate, channels, bitsPerSample),
      outputFormat: "wav",
      fileExtension: ".wav",
      voiceCompatible: false,
    };
  }

  if (/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(mimeType)) {
    return {
      audioBuffer: rawAudio,
      outputFormat: "mp3",
      fileExtension: ".mp3",
      voiceCompatible: false,
    };
  }
  if (/^audio\/(?:ogg|opus)(?:;|$)/i.test(mimeType)) {
    return {
      audioBuffer: rawAudio,
      outputFormat: "opus",
      fileExtension: ".ogg",
      voiceCompatible: true,
    };
  }
  if (/^audio\/flac(?:;|$)/i.test(mimeType)) {
    return {
      audioBuffer: rawAudio,
      outputFormat: "flac",
      fileExtension: ".flac",
      voiceCompatible: false,
    };
  }

  return {
    audioBuffer: rawAudio,
    outputFormat: "wav",
    fileExtension: ".wav",
    voiceCompatible: false,
  };
}
