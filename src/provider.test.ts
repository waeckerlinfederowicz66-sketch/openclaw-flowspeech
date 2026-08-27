import { describe, expect, it, vi } from "vitest";
import { buildFlowSpeechProvider } from "./provider.js";

describe("FlowSpeech OpenClaw provider", () => {
  it("reports configured state only when an API key exists", () => {
    const provider = buildFlowSpeechProvider();
    expect(provider.isConfigured?.({
      providerConfig: { apiKey: "test-key", baseUrl: "https://flowspeech.io" },
      timeoutMs: 5_000,
    })).toBe(true);
    expect(provider.isConfigured?.({ providerConfig: {}, timeoutMs: 5_000 })).toBe(false);
  });

  it("lists the documented FlowSpeech voices", async () => {
    const provider = buildFlowSpeechProvider();
    const voices = await provider.listVoices?.({ timeoutMs: 5_000 });
    expect(voices?.map((voice) => voice.id)).toContain("Kore");
    expect(voices?.map((voice) => voice.id)).toContain("Puck");
    expect(voices?.length).toBe(30);
  });

  it("maps OpenClaw synthesis to the FlowSpeech API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        mimeType: "audio/wav",
        audioBase64: Buffer.from("RIFFtest").toString("base64"),
      },
    }), { status: 200 })));
    const provider = buildFlowSpeechProvider();
    const result = await provider.synthesize?.({
      text: "Hello",
      cfg: {},
      providerConfig: { apiKey: "test-key", voiceName: "Puck" },
      target: "audio-file",
      timeoutMs: 5_000,
    });
    expect(result?.audioBuffer).toEqual(Buffer.from("RIFFtest"));
    expect(result?.fileExtension).toBe(".wav");
  });
});
