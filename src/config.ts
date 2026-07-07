/**
 * The single runtime-config module (user-stories/typescript_mail_intelligence.md
 * and user-stories/typescript_email_ui.md): AI settings for the intelligence
 * layer plus the Gmail bridge baseUrl, all read from Vite env vars.
 * Injectable: production reads import.meta.env; tests pass their own env
 * object, so no test ever depends on the ambient environment.
 *
 * - VITE_BRIDGE_URL — origin of the localhost Python bridge. Default
 *   http://127.0.0.1:8765; the Android emulator reaches the host machine via
 *   http://10.0.2.2:8765, and a physical device via the host's LAN address.
 * - VITE_AI_BASE_URL — OpenAI-compatible /v1 endpoint of the self-hosted
 *   server. Default is Ollama's http://127.0.0.1:11434/v1 (LM Studio serves
 *   :1234/v1, vLLM :8000/v1). Always the user's own machine or LAN.
 * - VITE_AI_MODEL — required, no default: fail fast with an error naming it.
 * - VITE_AI_API_KEY — placeholder for self-hosted servers, default
 *   "not-needed"; a real gateway key can be injected without code changes.
 */

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_AI_BASE_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_AI_API_KEY = 'not-needed';

type EnvLike = Record<string, string | undefined>;

export function loadAiConfig(
  env: EnvLike = import.meta.env as unknown as EnvLike,
): AiConfig {
  const model = env.VITE_AI_MODEL;
  if (!model) {
    throw new Error(
      'VITE_AI_MODEL is not set. Set VITE_AI_MODEL to the model your self-hosted ' +
        'inference server serves (e.g. the name shown by `ollama list` or GET /v1/models).',
    );
  }
  return {
    baseUrl: env.VITE_AI_BASE_URL || DEFAULT_AI_BASE_URL,
    model,
    apiKey: env.VITE_AI_API_KEY || DEFAULT_AI_API_KEY,
  };
}

export interface BridgeConfig {
  baseUrl: string;
}

export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8765';

export function loadBridgeConfig(
  env: EnvLike = import.meta.env as unknown as EnvLike,
): BridgeConfig {
  return { baseUrl: env.VITE_BRIDGE_URL || DEFAULT_BRIDGE_URL };
}
