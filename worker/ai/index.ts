// The Worker's AI client (D-015): Palmyra-X6 through AI Gateway when WRITER_API_KEY
// is set, otherwise the deterministic fixture (tests, local development, previews
// without the secret).
import { fixtureAi, type AiClient } from '../../shared/ai';
import { palmyraClient } from './palmyra';

export interface AiEnv {
  WRITER_API_KEY?: string;
  AI_GATEWAY_URL?: string;
}

const WRITER_DIRECT = 'https://api.writer.com/v1/chat/completions';

export function createAiClient(env: AiEnv): AiClient {
  if (!env.WRITER_API_KEY) return fixtureAi;
  return palmyraClient({ apiKey: env.WRITER_API_KEY, url: env.AI_GATEWAY_URL || WRITER_DIRECT });
}
