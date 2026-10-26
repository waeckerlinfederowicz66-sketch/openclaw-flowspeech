import { it } from 'vitest'
import { buildFlowSpeechProvider } from '../src/provider.js'
import { hostContractCases } from './host-contract.mjs'

for (const [name, run] of hostContractCases(buildFlowSpeechProvider)) it(name, run)
