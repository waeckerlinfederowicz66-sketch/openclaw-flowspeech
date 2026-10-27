# FlowSpeech for OpenClaw

## 0.2.2 Compatibility and Security Update

The npm peer range explicitly includes the tested OpenClaw `2026.7.1-2`
numeric-correction release. Version 0.2.1 omitted that prerelease from npm peer
resolution; use 0.2.2 for normal installation with this host. The stable host
minimum and the host's own compatibility checks are unchanged.

HTTP and terminal-job errors use fixed local messages. Bounded diagnostic tokens exclude the configured API key and API-only header values; remote error messages are not returned. An interrupted body retains HTTP status and Retry-After; permanent HTTP failures never retry. Errors may expose retryAfterMs alongside validated recovery IDs.

The host applies additional token redaction to displayed errors. It can mask
token-shaped substrings even in a valid UUID. The error's structured requestId
and jobId and its original local message retain exact IDs; do not reconstruct a
recovery ID from masked host log text. This plugin does not weaken host redaction.

A FlowSpeech public API v1 speech-provider plugin implementing OpenClaw's `SpeechProviderPlugin` contract. It submits a job, polls until completion and downloads WAV bytes. Voice selection is preserved; the host receives buffered audio with `.wav` extension and `voiceCompatible: false`.

## Local installation

Use a supported OpenClaw runtime: Node.js 22.22.3+, 24.15+ or 25.9+ (within the host's supported version ranges). This plugin is tested against OpenClaw 2026.7.1-2.

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run test:dist
npm pack
openclaw plugins install npm-pack:./openclaw-flowspeech-0.2.2.tgz
```

The npm compatibility update is version 0.2.2. The commands above build and install a local archive; they do not publish to or install from ClawHub. Do not use forced peer resolution to work around an incompatible host.

## Configure

Set `FLOWSPEECH_API_KEY` in the server process environment. Secret-aware OpenClaw provider configuration is also supported.

```json
{
  "messages": {
    "tts": {
      "provider": "flowspeech",
      "timeoutMs": 120000,
      "providers": {
        "flowspeech": {
          "voiceName": "Kore"
        }
      }
    }
  }
}
```

The host's `timeoutMs` is the total submission/poll/download deadline. Increase it for longer asynchronous recordings; the plugin never extends that host deadline. Timing out does not cancel the server job.

Allowed provider configuration fields:

| Field | Default | Meaning |
| --- | --- | --- |
| apiKey | FLOWSPEECH_API_KEY | Server-only secret |
| baseUrl | https://flowspeech.io | Exact official HTTPS origin only |
| voiceName | Kore | Default voice |
| speakerVoice / voice | unset | Host voice aliases, taking precedence over voiceName |
| requestTimeoutMs | 30000 | Per-request timeout |
| pollIntervalMs | 5000 | Minimum polling interval |
| maxRetries | 2 | Retries per transient HTTP operation, maximum 5 |
| maxAudioBytes | 16777216 | Maximum downloaded WAV size |

When the host permits voice overrides:

```text
[[tts:voice=Puck]] Here is the product update.
```

The plugin's offline voice list remains available without an API key. For the live catalog use `FlowSpeechClient.listVoices()`.

## Migration from local 0.1.0 code

Separate `prompt`, `style` and `emotion` settings/directives are not supported by v1. Configuration or direct overrides fail explicitly; text directives produce a host parser warning and are ignored when voice settings are allowed by host policy. They never throw out of the host directive parser. Unknown provider configuration/override fields are also rejected. The API returns a job and WAV URL, not inline base64 or PCM; no conversion of API PCM is performed.

The host's `speakerVoice`, `voice` and `voiceName` aliases are normalized in
that priority order. Generic `speaker_voice` and plugin voice directives work
with the host's normalized config and overrides; only `voiceName` is sent to
the FlowSpeech API.

The exported `synthesizeWithFlowSpeech` helper retains its text/key/voice/timeout arguments and accepts `requestId`, `signal` and custom fetch for applications/tests. It returns `requestId` and `jobId` alongside the standard host audio fields. The host's current buffered speech request has no abort-signal field, so plugin cancellation is bounded by the host timeout; direct helper/client callers can supply an abort signal.

The host speech surface supports a single voice per request. For explicit multi-speaker synthesis, use the exported client:

```ts
import { randomUUID } from 'node:crypto'
import { FlowSpeechClient } from 'openclaw-flowspeech'

const client = new FlowSpeechClient({ apiKey: process.env.FLOWSPEECH_API_KEY })
const requestId = randomUUID() // Persist before submission.
const result = await client.generate({
  mode: 'multi',
  segments: [
    { speaker: 'Alice', text: 'Welcome.', voiceName: 'Kore' },
    { speaker: 'Bob', text: 'Thank you.', voiceName: 'Puck' },
  ],
}, { requestId })
```

The plugin/helper only sends API credentials to the official origin. The generic exported client permits an explicitly configured HTTPS API origin, for trusted gateways. Storage downloads never carry those credentials. It does not provide streaming speech, telephony resampling or native voice-note encoding.

## v1 behavior and recovery

Requires a server-side developer API key and an active paid Basic, Pro or Scale subscription. Trials do not include API generation. Website cookies and plugin login tokens are not API credentials.

The API origin is `https://flowspeech.io`. Calls submit `{ input: ... }` to `POST /api/v1/tts/jobs` with a UUID `Idempotency-Key`, poll the returned job, then download its result. No model or legacy speaker fields are sent. Audio is WAV, 24000 Hz, mono, 16 bit. HTTP 200 from a status query is not generation success.

- Pending states: queued, running, merging, settling. Failed/cancelled jobs throw; a deleted success result throws `result_deleted`.
- Polling defaults to 5000 ms and cannot be configured faster. Longer `Retry-After` values, including HTTP dates and rate limits, take precedence.
- There are at most two transient retries per HTTP operation by default (configurable from zero to five). Submission retries preserve the exact UUID and JSON body.
- The total deadline includes submit, polling, retry waits, response-body reads and download. The general client default is 600000 ms; each request defaults to 30000 ms.
- Downloads use no API headers, Bearer token or cookies. HTTPS URLs with embedded credentials are rejected. API and storage redirects are rejected rather than followed. Downloads are bounded (64 MiB for the general client).
- Custom fetch implementations are trusted application code and must preserve the supplied abort, redirect and credential settings.
- Aborting or timing out stops local work; it does not cancel the server job or reverse a charge. Use `cancelJob` explicitly when cancellation is intended.

Each package exports `FlowSpeechClient` and `FlowSpeechError`. Save a fresh UUID before each new recording and pass it as `requestId`. Reuse it only with unchanged input. Error properties include `code`, `status`, `traceId`, `requestId` and `jobId` when known; do not automatically start a new job after a timeout or download error.

OpenClaw's host renders only error messages. Plugin synthesis errors therefore
also include validated recovery UUIDs in the message, without copying download
URLs or response bodies. Use those IDs with `findJob`/`getJob` and
`downloadJob` rather than resubmitting new work.

```ts
const client = new FlowSpeechClient({ apiKey: process.env.FLOWSPEECH_API_KEY })
const quota = await client.getQuota()
console.log(quota.quota.available)
const voices = await client.listVoices()

// Use the UUID previously saved for the interrupted recording.
const job = await client.findJob(savedRequestId)
// Or: await client.getJob(savedJobId)
// Poll pending jobs no faster than five seconds, or resume generate() with
// the same UUID and unchanged input; it replays the existing job.
if (job.status === 'success') {
  const bytes = await client.downloadJob(job) // never creates a recording
}
// await client.cancelJob(job.id)
```

The quota response preserves canonical top-level `quota`, `subscription` and `limits`. An optional `entitlement` field is also retained for compatibility; it is not required. Result links grant public link access and should not be logged or shared unnecessarily. Deleting a result does not necessarily invalidate a previously copied link.

Downloads validate the actual RIFF/WAVE container, chunk lengths and padding,
PCM format (24000 Hz, mono, 16 bit), byte rate/block alignment, and complete
nonempty aligned sample data. Truncated, malformed or mismatched audio is
rejected even on HTTP 200. Bounded unknown chunks are skipped safely and valid
files are returned byte-for-byte unchanged. Validation remains within the
operation deadline; an invalid download never triggers another submission.

Full API contract: [FlowSpeech public API](https://flowspeech.io/docs/public-api).

## Development and release status

Version 0.2.1 added the safety fixes described above. Version 0.2.2 preserves them and corrects npm peer resolution for the tested numeric-correction host. Previous published versions and their metadata are unchanged.

Install locked dependencies, then run the package checks and pack locally. Tests use only fake transports and synthetic WAV data; they do not spend generation credits. See `RELEASE_CHECKLIST.md` for maintainer release steps.

## License

MIT
