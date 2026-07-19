// Application entry point.

import { repo, on }             from "./storage/repository.js";
import { initSettingsWatcher }  from "./settings/settingsController.js";
import { initShell }            from "./ui/shell.js";
import { HomeView }             from "./ui/homeView.js";
import { VideoView }            from "./ui/videoView.js";
import { SourcesView }          from "./ui/sourcesView.js";
import { StatsView }            from "./ui/statsView.js";
import { SettingsView }         from "./ui/settingsView.js";
import { DailyLogView }         from "./ui/dailyLogView.js";
import { ModalController }      from "./ui/modalController.js";
import { AiAssistant }          from "./components/aiAssistant.js";
import { initInstallManager }   from "./pwa/installManager.js";
import { debounce }             from "./utils/helpers.js";
import { allVideosWithMeta }    from "./library/libraryQuery.js";
import { suggest }              from "./search/search.js";

// ── PWA: register service worker ──
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(reg => console.log("[SW] Registered, scope:", reg.scope))
      .catch(err => console.warn("[SW] Registration failed:", err));
  });
}

// ── Apply persisted settings (theme, density, grid size…) ──
initSettingsWatcher();

// ── PWA install button + iOS guide ──
initInstallManager();

// ── View management ──
const views = {
  home:     document.getElementById("view-home"),
  video:    document.getElementById("view-video"),
  sources:  document.getElementById("view-sources"),
  dailylog: document.getElementById("view-dailylog"),
  stats:    document.getElementById("view-stats"),
  settings: document.getElementById("view-settings"),
};

function showView(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  document.querySelector(".view-title-row").hidden = name !== "home";
  if (name !== "video") videoView.destroy();
}

function openVideo(videoId) {
  showView("video");
  videoView.open(videoId);
}

// ── Feature modules ──
const homeView     = new HomeView({ onOpenVideo: openVideo });
const videoView    = new VideoView({ onOpenVideo: openVideo, onAskAi: v => aiAssistant.openForVideo(v) });
const sourcesView  = new SourcesView();
const statsView    = new StatsView();
const dailyLogView = new DailyLogView({ onOpenVideo: openVideo });
const settingsView = new SettingsView({ onRequestApiKey: () => modals.openApiKey() });
const modals       = new ModalController({ onImported: () => { homeView.render(); sourcesView.render(); } });
const aiAssistant  = new AiAssistant();

// ── Sidebar / topbar shell ──
initShell({
  onNavigate: ({ view, filter }) => {
    if (view === "home")     { homeView.setFilter(filter || "all"); showView("home"); }
    if (view === "sources")  { sourcesView.render();  showView("sources"); }
    if (view === "dailylog") { dailyLogView.render(); showView("dailylog"); }
    if (view === "stats")    { statsView.render();    showView("stats"); }
    if (view === "settings") { settingsView.render(); showView("settings"); }
  },
});

// AI FAB (global chat)
document.getElementById("ai-fab").addEventListener("click", () => aiAssistant.openGlobal());

// ── Sort ──
document.getElementById("sort-select").value = repo.settings.defaultSort;
document.getElementById("sort-select").addEventListener("change", e => homeView.setSort(e.target.value));

// ── Search ──
const searchInput    = document.getElementById("search-input");
const suggestionsBox = document.getElementById("search-suggestions");

const runSearch = debounce(query => {
  homeView.setQuery(query);
  if (query.trim()) repo.addSearchTerm(query.trim());
  showView("home");
}, 250);

searchInput.addEventListener("input", e => {
  runSearch(e.target.value);
  renderSuggestions(e.target.value);
});
searchInput.addEventListener("focus", () => renderSuggestions(searchInput.value));
document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrap")) suggestionsBox.hidden = true;
});

function renderSuggestions(query) {
  if (!query.trim()) { suggestionsBox.hidden = true; return; }
  const matches = suggest(allVideosWithMeta(), query, 6);
  suggestionsBox.hidden = !matches.length;
  suggestionsBox.innerHTML = "";
  for (const v of matches) {
    const btn = document.createElement("button");
    btn.className = "suggestion-item";
    btn.textContent = v.title;
    btn.addEventListener("click", () => { suggestionsBox.hidden = true; openVideo(v.id); });
    suggestionsBox.appendChild(btn);
  }
}

// ── Keyboard shortcuts ──
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== searchInput && !e.target.closest("input,textarea,select")) {
    e.preventDefault(); searchInput.focus();
  }
  if (e.key === "Escape" && document.activeElement === searchInput) {
    searchInput.blur(); suggestionsBox.hidden = true;
  }
});

// ── Reactive re-render ──
on("videos:changed",   () => homeView.render());
on("flags:changed",    () => homeView.render());
on("progress:changed", () => homeView.render());

// ── Boot ──
homeView.render();
showView("home");
