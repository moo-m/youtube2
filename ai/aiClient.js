// A deliberately generic client for an OpenAI-compatible chat completions
// endpoint. The user supplies their own endpoint URL, API key, and model
// name in Settings — nothing is hardcoded, and no request is made until
// they do. Config lives only in this browser's localStorage.

import { STORAGE_KEYS, DEFAULT_AI_CONFIG } from "../utils/constants.js";
import { localStore } from "../storage/localStore.js";

export function getAiConfig() {
  return { ...DEFAULT_AI_CONFIG, ...localStore.get(STORAGE_KEYS.AI_CONFIG, {}) };
}

export function saveAiConfig(config) {
  localStore.set(STORAGE_KEYS.AI_CONFIG, config);
}

export function isAiConfigured() {
  const { endpoint, apiKey } = getAiConfig();
  return Boolean(endpoint && apiKey);
}

export const aiClient = {
  /**
   * @param {{role: "system"|"user"|"assistant", content: string}[]} messages
   * @returns {Promise<string>} assistant reply text
   */
  async chat(messages) {
    const { endpoint, apiKey, model } = getAiConfig();
    if (!endpoint || !apiKey) {
      throw new Error("No AI API is configured yet. Add an endpoint and key in Settings.");
    }

    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || undefined,
          messages,
          temperature: 0.5,
        }),
      });
    } catch (err) {
      throw new Error("Couldn't reach the AI endpoint. Check the URL and your connection.");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `AI request failed (${res.status}).`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error("The AI response didn't include any message content.");
    return reply.trim();
  },
};
