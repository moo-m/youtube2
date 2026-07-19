// The AI Assistant slide-over panel. Two modes:
//  - Global: a general chat thread, not tied to any video.
//  - Video-scoped: adds cacheable "Insights" (summary / key ideas /
//    enrichment examples) built from the video's title, description, and
//    transcript (if any), plus a chat thread scoped to that video so
//    follow-up questions have context. Everything — insights and chat
//    history — is persisted in IndexedDB and survives a refresh.

import { bigStore } from "../storage/bigStore.js";
import { aiClient, isAiConfigured } from "../ai/aiClient.js";
import { transcriptService } from "../captions/transcriptService.js";
import { el } from "../utils/helpers.js";
import { showToast } from "./toast.js";

const INSIGHT_TYPES = [
  { key: "summary", label: "Summary", prompt: "Summarize this video in a short, clear paragraph." },
  { key: "keyIdeas", label: "Key Ideas", prompt: "List the most important ideas or takeaways from this video as a concise bulleted list." },
  { key: "examples", label: "Enrichment Examples", prompt: "Suggest a few enrichment examples, related concepts, or follow-up questions a curious viewer could explore after watching this video." },
];

export class AiAssistant {
  constructor() {
    this.panel = document.getElementById("ai-panel");
    this.overlay = document.getElementById("ai-panel-overlay");
    this.scopeLabel = document.getElementById("ai-scope-label");
    this.insightsWrap = document.getElementById("ai-insights");
    this.messagesWrap = document.getElementById("ai-messages");
    this.form = document.getElementById("ai-input-form");
    this.input = document.getElementById("ai-input");
    this.configHint = document.getElementById("ai-config-hint");

    this.scopeId = "global";
    this.video = null; // set when opened for a specific video

    document.getElementById("ai-panel-close").addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", () => this.close());
    this.form.addEventListener("submit", (e) => { e.preventDefault(); this._sendMessage(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.panel.hidden) this.close(); });
  }

  async openGlobal() {
    this.scopeId = "global";
    this.video = null;
    this.scopeLabel.textContent = "General";
    this.insightsWrap.hidden = true;
    this._show();
    await this._renderMessages();
  }

  async openForVideo(video) {
    this.scopeId = video.id;
    this.video = video;
    this.scopeLabel.textContent = `About: ${video.title}`;
    this.insightsWrap.hidden = false;
    this._show();
    await this._renderInsights();
    await this._renderMessages();
  }

  _show() {
    this.panel.hidden = false;
    this.overlay.hidden = false;
    this.configHint.hidden = isAiConfigured();
    requestAnimationFrame(() => this.panel.classList.add("is-open"));
    this.input.focus();
  }

  close() {
    this.panel.classList.remove("is-open");
    setTimeout(() => { this.panel.hidden = true; this.overlay.hidden = true; }, 260);
  }

  async _buildVideoContext() {
    if (!this.video) return "";
    const transcript = await transcriptService.getCached(this.video.id);
    const transcriptText = transcript ? transcriptService.toPlainText(transcript, 4000) : "";
    return [
      `Title: ${this.video.title}`,
      `Channel: ${this.video.channelTitle}`,
      this.video.description ? `Description: ${this.video.description.slice(0, 1500)}` : "",
      transcriptText ? `Transcript excerpt: ${transcriptText}` : "(No transcript available for this video.)",
    ].filter(Boolean).join("\n\n");
  }

  async _renderInsights() {
    this.insightsWrap.innerHTML = "";
    const saved = (await bigStore.get(bigStore.STORES.AI_INSIGHTS, this.video.id)) || {};

    for (const type of INSIGHT_TYPES) {
      const card = el("div", { class: "ai-insight-card" });
      const content = saved[type.key];

      const header = el("div", { class: "ai-insight-header" }, [
        el("span", { class: "ai-insight-label" }, type.label),
        el("button", {
          class: "btn btn-ghost ai-insight-btn",
          onClick: () => this._generateInsight(type, card),
        }, content ? "Regenerate" : "Generate"),
      ]);

      card.append(header, el("div", { class: "ai-insight-body" }, content || ""));
      this.insightsWrap.appendChild(card);
    }
  }

  async _generateInsight(type, card) {
    if (!isAiConfigured()) {
      showToast("Add an AI endpoint and key in Settings first.", { type: "error" });
      return;
    }
    const body = card.querySelector(".ai-insight-body");
    const btn = card.querySelector(".ai-insight-btn");
    body.textContent = "Thinking…";
    body.classList.add("is-loading");
    btn.disabled = true;

    try {
      const context = await this._buildVideoContext();
      const reply = await aiClient.chat([
        { role: "system", content: "You help a viewer get more out of a video they've added to their personal library. Be concise and specific to the video context given." },
        { role: "user", content: `${context}\n\nTask: ${type.prompt}` },
      ]);

      body.textContent = reply;
      btn.textContent = "Regenerate";

      const saved = (await bigStore.get(bigStore.STORES.AI_INSIGHTS, this.video.id)) || { videoId: this.video.id };
      saved[type.key] = reply;
      saved.generatedAt = new Date().toISOString();
      await bigStore.put(bigStore.STORES.AI_INSIGHTS, saved);
    } catch (err) {
      body.textContent = err.message || "Something went wrong generating this.";
    } finally {
      body.classList.remove("is-loading");
      btn.disabled = false;
    }
  }

  async _renderMessages() {
    const record = await bigStore.get(bigStore.STORES.AI_CONVERSATIONS, this.scopeId);
    this.messages = record?.messages || [];
    this.messagesWrap.innerHTML = "";
    for (const msg of this.messages) this._appendMessageEl(msg);
    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;
  }

  _appendMessageEl({ role, content }) {
    this.messagesWrap.appendChild(el("div", { class: `ai-message ai-message-${role}` }, content));
  }

  async _sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    if (!isAiConfigured()) {
      showToast("Add an AI endpoint and key in Settings first.", { type: "error" });
      return;
    }

    this.input.value = "";
    const userMsg = { role: "user", content: text };
    this.messages.push(userMsg);
    this._appendMessageEl(userMsg);
    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;

    const thinkingEl = el("div", { class: "ai-message ai-message-assistant is-loading" }, "Thinking…");
    this.messagesWrap.appendChild(thinkingEl);
    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;

    try {
      const systemPrompt = this.video
        ? { role: "system", content: `You're discussing this specific video with the viewer:\n\n${await this._buildVideoContext()}` }
        : { role: "system", content: "You're a helpful assistant inside the viewer's personal video library app." };

      const reply = await aiClient.chat([systemPrompt, ...this.messages]);
      thinkingEl.remove();
      const assistantMsg = { role: "assistant", content: reply };
      this.messages.push(assistantMsg);
      this._appendMessageEl(assistantMsg);
    } catch (err) {
      thinkingEl.remove();
      this._appendMessageEl({ role: "assistant", content: err.message || "Something went wrong." });
    }

    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight;
    await bigStore.put(bigStore.STORES.AI_CONVERSATIONS, { scopeId: this.scopeId, messages: this.messages });
  }
}
