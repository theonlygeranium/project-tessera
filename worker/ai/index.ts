// The Worker's AI client (D-015). Lane F replaces this with the Palmyra-X6 client
// (through AI Gateway) when WRITER_API_KEY is set, keeping the fixture otherwise.
import { fixtureAi, type AiClient } from '../../shared/ai';

export interface AiEnv {
  WRITER_API_KEY?: string;
  AI_GATEWAY_URL?: string;
}

export function createAiClient(_env: AiEnv): AiClient {
  return fixtureAi;
}
