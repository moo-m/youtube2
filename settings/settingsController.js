// Applies persisted settings to the document (theme, density, grid size,
// animation speed) and exposes helpers for the Settings view to call.

import { repo } from "../storage/repository.js";

function resolveTheme(theme) {
  if (theme === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

export function applySettingsToDom() {
  const s = repo.settings;
  document.documentElement.setAttribute("data-theme", resolveTheme(s.theme));
  document.documentElement.setAttribute("data-density", s.density);
  document.documentElement.style.setProperty(
    "--grid-card-min",
    { small: "180px", medium: "240px", large: "300px" }[s.gridSize] || "240px"
  );
  document.documentElement.style.setProperty(
    "--motion-scale",
    { reduced: "0", normal: "1", lively: "1.4" }[s.animationSpeed] ?? "1"
  );
}

export function initSettingsWatcher() {
  applySettingsToDom();
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (repo.settings.theme === "auto") applySettingsToDom();
  });
}
