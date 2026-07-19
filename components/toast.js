// Simple toast notifications appended to #toast-region.

import { el } from "../utils/helpers.js";

export function showToast(message, { type = "info", duration = 4000 } = {}) {
  const region = document.getElementById("toast-region");
  if (!region) return;

  const toast = el("div", { class: `toast${type === "error" ? " toast-error" : ""}` }, message);
  region.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 200ms ease, transform 200ms ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(16px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
