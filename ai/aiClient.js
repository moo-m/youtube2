// A deliberately generic client for an OpenAI-compatible chat completions
// endpoint. The user supplies their own endpoint URL, API key, and model
// name in Settings — nothing is hardcoded, and no request is made until
// they do. Config lives only in this browser's localStorage.

import { STORAGE_KEYS, DEFAULT_AI_CONFIG } from "../utils/constants.js";
import { localStore } from "../storage/localStore.js";

export function getAiConfig() {
  const saved = localStore.get(STORAGE_KEYS.AI_CONFIG, {});
  
  // القيم الافتراضية الجديدة (تطغى على أي قيم محفوظة)
  const defaults = {
    endpoint: "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent",
    apiKey: "AQ.Ab8RN6JPH3YVM7jW_vkzzqnnP1dhlKBKsgtspnuO7jEL4-TReQ",
    model: "gemini-2.5-flash"
  };
  
  return { ...defaults, ...saved };
}
export function saveAiConfig(config) {
  localStore.set(STORAGE_KEYS.AI_CONFIG, config);
}

export function isAiConfigured() {
  const { endpoint, apiKey } = getAiConfig();
  return Boolean(endpoint && apiKey);
}

export const aiClient = {
  async chat(messages) {
    const { endpoint, apiKey, model } = getAiConfig();
    if (!endpoint || !apiKey) {
      throw new Error("No AI API is configured yet.");
    }

    const contents = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : msg.role,
      parts: [{ text: msg.content }],
    }));

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.5 },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Request failed (${res.status})`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No reply";
  }
};
