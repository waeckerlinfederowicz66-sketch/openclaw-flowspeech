import { describe, expect, it } from "vitest";
import { parseSampleRate, pcm16ToWav } from "./audio.js";

describe("audio helpers", () => {
  it("wraps PCM16 bytes in a valid WAV container", () => {
    const result = pcm16ToWav(Buffer.from([0, 0, 1, 0]), 24_000, 1, 16);
    expect(result.subarray(0, 4).toString()).toBe("RIFF");
    expect(result.subarray(8, 12).toString()).toBe("WAVE");
    expect(result.readUInt32LE(24)).toBe(24_000);
    expect(result.readUInt32LE(40)).toBe(4);
    expect(result.subarray(44)).toEqual(Buffer.from([0, 0, 1, 0]));
  });

  it("parses sample rates from L16 MIME types", () => {
    expect(parseSampleRate("audio/L16;rate=24000")).toBe(24_000);
  });
});
