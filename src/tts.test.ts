import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeFlowSpeechBaseUrl, synthesizeWithFlowSpeech } from "./tts.js";

describe("FlowSpeech TTS client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends an authenticated request and wraps L16 output as WAV", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        mimeType: "audio/L16;rate=24000",
        audioBase64: Buffer.from([0, 0, 1, 0]).toString("base64"),
        sampleRate: 24_000,
        numChannels: 1,
        bitsPerSample: 16,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeWithFlowSpeech({
      text: "Hello from OpenClaw",
      apiKey: "test-key",
      voiceName: "Kore",
      prompt: "calm narration",
      timeoutMs: 5_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://flowspeech.io/api/ai/text-to-speech");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "Hello from OpenClaw",
      originalText: "Hello from OpenClaw",
      speakers: [{ voiceName: "Kore" }],
      prompt: "calm narration",
    });
    expect(result.outputFormat).toBe("wav");
    expect(result.fileExtension).toBe(".wav");
    expect(result.audioBuffer.subarray(0, 4).toString()).toBe("RIFF");
  });

  it("preserves provider error details without exposing the credential", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 401,
      message: "Invalid API key",
    }), { status: 401 })));

    await expect(synthesizeWithFlowSpeech({
      text: "hello",
      apiKey: "secret-value",
      voiceName: "Kore",
      timeoutMs: 5_000,
    })).rejects.toThrow("FlowSpeech API error (401): Invalid API key");
  });

  it.each([
    "http://flowspeech.io",
    "https://flowspeech.io.example.com",
    "https://user:pass@flowspeech.io",
    "https://flowspeech.io/custom-path",
  ])("rejects unsafe base URL %s", (url) => {
    expect(() => normalizeFlowSpeechBaseUrl(url)).toThrow();
  });

  it("rejects oversized decoded audio before buffering it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        mimeType: "audio/wav",
        audioBase64: Buffer.alloc(12).toString("base64"),
      },
    }), { status: 200 })));

    await expect(synthesizeWithFlowSpeech({
      text: "hello",
      apiKey: "test-key",
      voiceName: "Kore",
      timeoutMs: 5_000,
      maxAudioBytes: 4,
    })).rejects.toThrow("FlowSpeech audio response exceeds 4 bytes");
  });
});
