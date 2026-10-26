import type { SpeechProviderPlugin } from 'openclaw/plugin-sdk/speech'
export function hostContractCases(buildProvider: () => SpeechProviderPlugin): Array<[string, () => Promise<void>]>
