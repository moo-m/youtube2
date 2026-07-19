// Wires up sidebar navigation, topbar controls (search/sort/view/theme),
// and persists layout preferences (sidebar collapsed state, layout mode).

import { repo } from "../storage/repository.js";
import { STORAGE_KEYS } from "../utils/constants.js";
import { localStore } from "../storage/localStore.js";
import { applySettingsToDom } from "../settings/settingsController.js";

export function initShell({ onNavigate }) {
  const sidebar = document.getElementById("sidebar");
  const navItems = [...document.querySelectorAll(".nav-item")];

  // Restore sidebar collapsed state
  const collapsed = localStore.get(STORAGE_KEYS.SIDEBAR_STATE, false);
  sidebar.dataset.collapsed = String(collapsed);

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    // On narrow viewports this opens/closes the drawer; on wide viewports it collapses.
    if (window.innerWidth <= 860) {
      const open = sidebar.dataset.open === "true";
      sidebar.dataset.open = String(!open);
    } else {
      const next = sidebar.dataset.collapsed !== "true";
      sidebar.dataset.collapsed = String(next);
      localStore.set(STORAGE_KEYS.SIDEBAR_STATE, next);
    }
  });

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((n) => n.classList.remove("is-active"));
      item.classList.add("is-active");
      sidebar.dataset.open = "false";
      onNavigate({ view: item.dataset.view, filter: item.dataset.filter });
    });
  });

  // Theme toggle cycles dark -> light -> auto -> dark
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const order = ["dark", "light", "auto"];
    const next = order[(order.indexOf(repo.settings.theme) + 1) % order.length];
    repo.updateSettings({ theme: next });
    applySettingsToDom();
  });

  // Grid/List toggle
  const gridBtn = document.getElementById("view-grid");
  const listBtn = document.getElementById("view-list");
  const grid = document.getElementById("video-grid");

  function setLayout(layout) {
    repo.updateSettings({ layout });
    grid.classList.toggle("is-list", layout === "list");
    gridBtn.classList.toggle("is-active", layout === "grid");
    listBtn.classList.toggle("is-active", layout === "list");
  }
  gridBtn.addEventListener("click", () => setLayout("grid"));
  listBtn.addEventListener("click", () => setLayout("list"));
  setLayout(repo.settings.layout);

  return { setActiveNav: (view, filter) => {
    navItems.forEach((n) => n.classList.toggle("is-active", n.dataset.view === view && (filter ? n.dataset.filter === filter : true)));
  } };
}
