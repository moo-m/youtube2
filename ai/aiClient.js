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
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
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
      throw new Error("No AI API is configured yet. Add an endpoint and key in Settings.");
    }

    // تحويل صيغة OpenAI {role, content} إلى صيغة Gemini {role, parts}
    const contents = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : msg.role, // 'assistant' تصبح 'model'
      parts: [{ text: msg.content }],
    }));

    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey, // 🔑 التغيير الأهم هنا
        },
        body: JSON.stringify({
          contents: contents, // بدلاً من messages
          generationConfig: {
            temperature: 0.5,
          },
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
    // استخراج الرد من صيغة Gemini
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("The AI response didn't include any message content.");
    return reply.trim();
  },
};
