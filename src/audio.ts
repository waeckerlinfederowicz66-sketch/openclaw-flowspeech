export function pcm16ToWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  if (bitsPerSample !== 16) {
    throw new Error(`FlowSpeech PCM output uses unsupported ${bitsPerSample}-bit samples`);
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("FlowSpeech returned an invalid sample rate");
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > 8) {
    throw new Error("FlowSpeech returned an invalid channel count");
  }

  const header = Buffer.alloc(44);
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export function parseSampleRate(mimeType: string): number | undefined {
  const match = /(?:^|;)\s*rate=(\d+)/i.exec(mimeType);
  if (!match?.[1]) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
