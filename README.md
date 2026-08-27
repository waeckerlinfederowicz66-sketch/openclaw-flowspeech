# FlowSpeech for OpenClaw

`openclaw-flowspeech` is an external speech-provider plugin that connects OpenClaw to [FlowSpeech](https://flowspeech.io/), a context-aware text-to-speech service with voice selection and style prompting.

The plugin follows OpenClaw's public `SpeechProviderPlugin` contract. It keeps the API key in OpenClaw configuration or the `FLOWSPEECH_API_KEY` environment variable and sends it only to the official `https://flowspeech.io` host.

## Features

- Registers the `flowspeech` speech provider with OpenClaw
- Supports 30 FlowSpeech voices, with `Kore` as the default
- Maps `[[tts:voice=...]]` directives to FlowSpeech voice selection
- Maps allowed `prompt`, `style`, or `emotion` voice settings to the FlowSpeech prompt
- Converts `audio/L16` PCM responses into standard WAV files
- Rejects redirects, non-HTTPS URLs, lookalike hosts, oversized audio, and malformed responses
- Does not bundle API keys or other credentials

## Install

After the ClawHub release is approved:

```bash
openclaw plugins install clawhub:openclaw-flowspeech
```

For local package testing:

```bash
npm install
npm pack
openclaw plugins install npm-pack:./openclaw-flowspeech-0.1.0.tgz --force
```

## Configure

Set the API key in the process environment:

```bash
export FLOWSPEECH_API_KEY="your_api_key"
```

Then select the provider in OpenClaw TTS configuration:

```json
{
  "messages": {
    "tts": {
      "provider": "flowspeech",
      "providers": {
        "flowspeech": {
          "voiceName": "Kore"
        }
      }
    }
  }
}
```

An API key can also be supplied through OpenClaw's secret-aware provider configuration. Do not commit it to this repository.

## Usage

Use OpenClaw's standard TTS command or automatic TTS mode. When model overrides are enabled, a message may select a voice:

```text
[[tts:voice=Puck]] Welcome to the product update.
```

When voice settings are allowed, a style prompt is also supported:

```text
[[tts:style=calm and reassuring]] Your report is ready.
```

## Provider configuration

| Field | Default | Description |
| --- | --- | --- |
| `apiKey` | `FLOWSPEECH_API_KEY` | Secret API credential |
| `baseUrl` | `https://flowspeech.io` | Fixed official FlowSpeech HTTPS host |
| `voiceName` | `Kore` | Default voice |
| `prompt` | unset | Optional default delivery/style prompt |

## Development

Use Node.js 22.22.3+, 24.15+, or 25.9+.

```bash
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

Tests use mocked HTTP responses and contain no live provider credentials.

## Security

- The plugin never logs the API key.
- `baseUrl` must be HTTPS and must resolve to the exact `flowspeech.io` hostname.
- Redirect following is disabled so authorization headers cannot be forwarded to another host.
- Response sizes are bounded before audio is decoded.

Report security issues privately to `support@flowspeech.io` rather than opening a public issue containing credentials.

## License

MIT
