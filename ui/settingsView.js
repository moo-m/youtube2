import { repo } from "../storage/repository.js";
import { applySettingsToDom } from "../settings/settingsController.js";
import { el } from "../utils/helpers.js";
import { showToast } from "../components/toast.js";
import { saveApiKey, hasApiKey } from "../api/youtubeApi.js";
import { getAiConfig, saveAiConfig, isAiConfigured } from "../ai/aiClient.js";
import { bigStore } from "../storage/bigStore.js";
import { dailyLog } from "../library/dailyLog.js";

export class SettingsView {
  constructor({ onRequestApiKey } = {}) {
    this.container = document.getElementById("settings-panel");
    this.onRequestApiKey = onRequestApiKey || (() => {});
  }

  render() {
    this.container.innerHTML = "";
    this.container.append(
      this._themeSection(),
      this._displaySection(),
      this._defaultsSection(),
      this._apiSection(),
      this._aiSection(),
      this._dataSection(),
      this._dangerSection(),
    );
  }

  _segmented(options, current, onSelect) {
    const wrap = el("div", { class: "segmented" });
    for (const opt of options) {
      const btn = el("button", {
        class: opt.value === current ? "is-active" : "",
        onClick: () => { onSelect(opt.value); this.render(); },
      }, opt.label);
      wrap.appendChild(btn);
    }
    return wrap;
  }

  _row(label, hint, control) {
    return el("div", { class: "settings-row" }, [
      el("div", {}, [
        el("div", { class: "settings-row-label" }, label),
        hint ? el("div", { class: "settings-row-hint" }, hint) : null,
      ]),
      control,
    ]);
  }

  _themeSection() {
    const s = repo.settings;
    return el("div", { class: "settings-section" }, [
      el("h3", {}, "Appearance"),
      this._row("Theme", "Dark, light, or match your system", this._segmented(
        [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "auto", label: "Auto" }],
        s.theme,
        (v) => { repo.updateSettings({ theme: v }); applySettingsToDom(); }
      )),
      this._row("Animation speed", "Reduce for a calmer interface", this._segmented(
        [{ value: "reduced", label: "Reduced" }, { value: "normal", label: "Normal" }, { value: "lively", label: "Lively" }],
        s.animationSpeed,
        (v) => { repo.updateSettings({ animationSpeed: v }); applySettingsToDom(); }
      )),
    ]);
  }

  _displaySection() {
    const s = repo.settings;
    return el("div", { class: "settings-section" }, [
      el("h3", {}, "Layout"),
      this._row("Grid size", "Size of thumbnails in the grid", this._segmented(
        [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }],
        s.gridSize,
        (v) => { repo.updateSettings({ gridSize: v }); applySettingsToDom(); }
      )),
      this._row("Card density", "Spacing between cards", this._segmented(
        [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }],
        s.density,
        (v) => { repo.updateSettings({ density: v }); applySettingsToDom(); }
      )),
    ]);
  }

  _defaultsSection() {
    const s = repo.settings;
    const sortSelect = el("select", { class: "select", onChange: (e) => repo.updateSettings({ defaultSort: e.target.value }) },
      ["newest", "oldest", "most-watched", "least-watched", "alphabetical", "recently-watched", "progress", "duration"]
        .map((v) => el("option", { value: v, selected: v === s.defaultSort ? "selected" : undefined }, v.replace("-", " "))));

    const filterSelect = el("select", { class: "select", onChange: (e) => repo.updateSettings({ defaultFilter: e.target.value }) },
      ["all", "unwatched", "watching", "completed", "favorites", "watchlater", "hidden"]
        .map((v) => el("option", { value: v, selected: v === s.defaultFilter ? "selected" : undefined }, v)));

    return el("div", { class: "settings-section" }, [
      el("h3", {}, "Defaults"),
      this._row("Default sort", "Applied each time you open Video Library", sortSelect),
      this._row("Default filter", "Applied each time you open Video Library", filterSelect),
    ]);
  }

  _apiSection() {
    return el("div", { class: "settings-section" }, [
      el("h3", {}, "YouTube Data API"),
      this._row("API key", hasApiKey() ? "A key is saved in this browser" : "Needed to import channels and playlists",
        el("button", { class: "btn btn-ghost", onClick: () => this.onRequestApiKey() }, hasApiKey() ? "Change key" : "Add key")),
    ]);
  }

  _aiSection() {
    const config = getAiConfig();
    const endpointInput = el("input", { class: "text-input", type: "text", placeholder: "https://api.example.com/v1/chat/completions", value: config.endpoint });
    const keyInput = el("input", { class: "text-input", type: "password", placeholder: "sk-…", value: config.apiKey });
    const modelInput = el("input", { class: "text-input", type: "text", placeholder: "model name (optional)", value: config.model });

    const save = () => {
      saveAiConfig({ endpoint: endpointInput.value.trim(), apiKey: keyInput.value.trim(), model: modelInput.value.trim() });
      showToast("AI configuration saved");
      this.render();
    };

    return el("div", { class: "settings-section" }, [
      el("h3", {}, "AI Assistant"),
      el("p", { class: "settings-row-hint" },
        isAiConfigured()
          ? "An AI API is configured. You can ask questions from the Assistant panel, and generate summaries, key ideas, and enrichment examples for any video."
          : "Add any OpenAI-compatible chat completions endpoint to enable the AI Assistant — per-video summaries, key ideas, enrichment examples, and free-form Q&A."),
      el("label", { class: "field-label" }, "Endpoint URL"),
      endpointInput,
      el("label", { class: "field-label" }, "API key"),
      keyInput,
      el("label", { class: "field-label" }, "Model (optional)"),
      modelInput,
      el("div", { class: "import-export-row" }, [
        el("button", { class: "btn btn-brass", onClick: save }, "Save AI configuration"),
      ]),
    ]);
  }

  _dataSection() {
    return el("div", { class: "settings-section" }, [
      el("h3", {}, "Import & export"),
      el("p", { class: "settings-row-hint" }, "Save your entire library — sources, progress, favorites, settings, transcripts, daily log, and AI conversations — as one file, or restore it on another device."),
      el("div", { class: "import-export-row" }, [
        el("button", { class: "btn btn-brass", onClick: () => this._exportData() }, "Export library"),
        el("button", { class: "btn btn-ghost", onClick: () => this._importData() }, "Import library"),
      ]),
    ]);
  }

  _dangerSection() {
    return el("div", { class: "settings-section danger-zone" }, [
      el("h3", {}, "Clear data"),
      this._row("Clear watch history", "Removes 'last watched' timestamps", this._dangerBtn("Clear", () => {
        if (confirm("Clear watch history?")) { repo.clearHistory(); showToast("Watch history cleared"); }
      })),
      this._row("Clear progress", "Resets resume positions and completion", this._dangerBtn("Clear", () => {
        if (confirm("Clear all watch progress?")) { repo.clearProgress(); showToast("Progress cleared"); }
      })),
      this._row("Clear favorites", null, this._dangerBtn("Clear", () => {
        if (confirm("Clear favorites?")) { repo.clearFavorites(); showToast("Favorites cleared"); }
      })),
      this._row("Clear Watch Later", null, this._dangerBtn("Clear", () => {
        if (confirm("Clear Watch Later?")) { repo.clearWatchLater(); showToast("Watch Later cleared"); }
      })),
      this._row("Clear hidden videos", null, this._dangerBtn("Clear", () => {
        if (confirm("Unhide all hidden videos?")) { repo.clearHidden(); showToast("Hidden videos cleared"); }
      })),
      this._row("Clear daily log", "Removes your day-by-day watch history", this._dangerBtn("Clear", async () => {
        if (confirm("Clear the daily log?")) { await dailyLog.clear(); showToast("Daily log cleared"); }
      })),
      this._row("Clear AI data", "Removes cached summaries, insights, and chat history", this._dangerBtn("Clear", async () => {
        if (confirm("Clear all AI conversations and insights?")) {
          await bigStore.clear(bigStore.STORES.AI_CONVERSATIONS);
          await bigStore.clear(bigStore.STORES.AI_INSIGHTS);
          showToast("AI data cleared");
        }
      })),
      this._row("Clear transcripts", "Removes cached and pasted transcripts", this._dangerBtn("Clear", async () => {
        if (confirm("Clear all cached transcripts?")) { await bigStore.clear(bigStore.STORES.TRANSCRIPTS); showToast("Transcripts cleared"); }
      })),
      this._row("Reset entire library", "Removes all sources, videos, settings, and everything above", this._dangerBtn("Reset library", async () => {
        if (confirm("This deletes everything and can't be undone. Continue?")) {
          repo.resetLibrary();
          await bigStore.clearAll();
          showToast("Library reset");
        }
      })),
    ]);
  }

  _dangerBtn(label, onClick) {
    return el("button", { class: "btn btn-danger", onClick }, label);
  }

  async _exportData() {
    const localData = repo.exportAll();
    const bigData = await bigStore.exportAll();
    const data = { ...localData, indexedDb: bigData };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `video-library-export-${Date.now()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Library exported");
  }

  _importData() {
    const input = el("input", { type: "file", accept: "application/json" });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        repo.importAll(data);
        if (data.indexedDb) await bigStore.importAll(data.indexedDb);
        applySettingsToDom();
        this.render();
        showToast("Library imported");
      } catch (err) {
        showToast("Couldn't import that file.", { type: "error" });
      }
    });
    input.click();
  }
}
