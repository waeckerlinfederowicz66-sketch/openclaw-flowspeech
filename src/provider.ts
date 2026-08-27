import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";
import type {
  SpeechDirectiveTokenParseContext,
  SpeechProviderConfig,
  SpeechProviderPlugin,
} from "openclaw/plugin-sdk/speech";
import { trimToUndefined } from "openclaw/plugin-sdk/speech-core";
import { synthesizeWithFlowSpeech, normalizeFlowSpeechBaseUrl } from "./tts.js";
import { FLOWSPEECH_VOICES } from "./voices.js";

type FlowSpeechProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  voiceName: string;
  prompt?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeConfig(rawConfig: Record<string, unknown>): FlowSpeechProviderConfig {
  const providers = asRecord(rawConfig.providers);
  const raw = asRecord(providers?.flowspeech) ?? asRecord(rawConfig.flowspeech);
  const apiKey = normalizeResolvedSecretInputString({
    value: raw?.apiKey,
    path: "tts.providers.flowspeech.apiKey",
  });
  const prompt = trimToUndefined(raw?.prompt);
  return {
    ...(apiKey ? { apiKey } : {}),
    baseUrl: normalizeFlowSpeechBaseUrl(trimToUndefined(raw?.baseUrl)),
    voiceName: trimToUndefined(raw?.voiceName) ?? "Kore",
    ...(prompt ? { prompt } : {}),
  };
}

function readConfig(config: SpeechProviderConfig): FlowSpeechProviderConfig {
  const apiKey = trimToUndefined(config.apiKey);
  const prompt = trimToUndefined(config.prompt);
  return {
    ...(apiKey ? { apiKey } : {}),
    baseUrl: normalizeFlowSpeechBaseUrl(trimToUndefined(config.baseUrl)),
    voiceName: trimToUndefined(config.voiceName) ?? "Kore",
    ...(prompt ? { prompt } : {}),
  };
}

function resolveApiKey(value: unknown): string | undefined {
  return trimToUndefined(value) ?? trimToUndefined(process.env.FLOWSPEECH_API_KEY);
}

function parseDirectiveToken(ctx: SpeechDirectiveTokenParseContext): {
  handled: boolean;
  overrides?: Record<string, unknown>;
} {
  switch (ctx.key) {
    case "voice":
    case "voice_name":
    case "voicename":
    case "flowspeech_voice":
      if (!ctx.policy.allowVoice) return { handled: true };
      return { handled: true, overrides: { ...ctx.currentOverrides, voiceName: ctx.value } };
    case "prompt":
    case "style":
    case "emotion":
      if (!ctx.policy.allowVoiceSettings) return { handled: true };
      return { handled: true, overrides: { ...ctx.currentOverrides, prompt: ctx.value } };
    default:
      return { handled: false };
  }
}

export function buildFlowSpeechProvider(): SpeechProviderPlugin {
  return {
    id: "flowspeech",
    label: "FlowSpeech",
    autoSelectOrder: 40,
    voices: FLOWSPEECH_VOICES.map((voice) => voice.id),
    resolveConfig: ({ rawConfig }) => normalizeConfig(rawConfig),
    parseDirectiveToken,
    listVoices: async () => FLOWSPEECH_VOICES.map((voice) => ({
      id: voice.id,
      name: voice.id,
      description: voice.description,
      gender: voice.gender,
    })),
    isConfigured: ({ providerConfig }) => {
      if (!resolveApiKey(providerConfig.apiKey)) return false;
      try {
        normalizeFlowSpeechBaseUrl(trimToUndefined(providerConfig.baseUrl));
        return true;
      } catch {
        return false;
      }
    },
    synthesize: async (req) => {
      const config = readConfig(req.providerConfig);
      const apiKey = resolveApiKey(config.apiKey);
      if (!apiKey) throw new Error("FlowSpeech API key missing");
      const voiceName = trimToUndefined(req.providerOverrides?.voiceName) ?? config.voiceName;
      const prompt = trimToUndefined(req.providerOverrides?.prompt) ?? config.prompt;
      return await synthesizeWithFlowSpeech({
        text: req.text,
        apiKey,
        voiceName,
        ...(prompt ? { prompt } : {}),
        baseUrl: config.baseUrl,
        timeoutMs: req.timeoutMs,
      });
    },
  };
}
