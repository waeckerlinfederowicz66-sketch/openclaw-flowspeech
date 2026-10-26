import {
  definePluginEntry,
  type OpenClawPluginDefinition,
} from "openclaw/plugin-sdk/plugin-entry";
import { buildFlowSpeechProvider } from "./provider.js";

export * from './flowspeech-client.js';

export { buildFlowSpeechProvider } from "./provider.js";
export { synthesizeWithFlowSpeech } from "./tts.js";

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "flowspeech",
  name: "FlowSpeech",
  description: "FlowSpeech public API v1 speech provider",
  register(api) {
    api.registerSpeechProvider(buildFlowSpeechProvider());
  },
});

export default plugin;
