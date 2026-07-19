// Controls the Add Source modal and the API Key modal.

import { importer } from "../library/importer.js";
import { hasApiKey, saveApiKey, youtubeApi } from "../api/youtubeApi.js";
import { showToast } from "../components/toast.js";

export class ModalController {
  constructor({ onImported } = {}) {
    this.onImported = onImported || (() => {});
    this._bindAddSource();
    this._bindApiKey();
  }

  openAddSource() {
    if (!hasApiKey()) {
      this.openApiKey({ thenOpenAddSource: true });
      return;
    }
    document.getElementById("modal-add-source").hidden = false;
    document.getElementById("source-url").focus();
  }

  openApiKey({ thenOpenAddSource = false } = {}) {
    this._thenOpenAddSource = thenOpenAddSource;
    document.getElementById("modal-api-key").hidden = false;
    document.getElementById("api-key-input").focus();
  }

  _bindAddSource() {
    const overlay = document.getElementById("modal-add-source");
    const input = document.getElementById("source-url");
    const status = document.getElementById("add-source-status");
    const confirmBtn = document.getElementById("confirm-add-source");

    const close = () => { overlay.hidden = true; input.value = ""; status.textContent = ""; status.classList.remove("is-error"); };

    document.getElementById("close-add-source").addEventListener("click", close);
    document.getElementById("cancel-add-source").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

    const submit = async () => {
      const url = input.value.trim();
      if (!url) return;
      confirmBtn.disabled = true;
      status.classList.remove("is-error");
      status.textContent = "Importing…";
      try {
        const { source, addedCount, skippedShorts } = await importer.addFromUrl(url);
        status.textContent = `Imported "${source.title}": ${addedCount} video${addedCount === 1 ? "" : "s"}${skippedShorts ? `, ${skippedShorts} Short${skippedShorts === 1 ? "" : "s"} skipped` : ""}.`;
        showToast(`Added "${source.title}"`);
        this.onImported();
        setTimeout(close, 1200);
      } catch (err) {
        status.classList.add("is-error");
        status.textContent = err.message || "Something went wrong importing that URL.";
      } finally {
        confirmBtn.disabled = false;
      }
    };

    confirmBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

    document.getElementById("open-add-source").addEventListener("click", () => this.openAddSource());
    document.getElementById("empty-add-source").addEventListener("click", () => this.openAddSource());
  }

  _bindApiKey() {
    const overlay = document.getElementById("modal-api-key");
    const input = document.getElementById("api-key-input");
    const status = document.getElementById("api-key-status");

    const close = () => { overlay.hidden = true; status.textContent = ""; };

    document.getElementById("cancel-api-key").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    document.getElementById("confirm-api-key").addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) { status.textContent = "Enter a valid API key."; status.classList.add("is-error"); return; }
      saveApiKey(key);
      status.classList.remove("is-error");
      close();
      showToast("API key saved");
      if (this._thenOpenAddSource) {
        this._thenOpenAddSource = false;
        this.openAddSource();
      }
    });
  }
}
