// PWA Install Manager
// Handles: Chrome/Edge beforeinstallprompt, iOS Safari manual guide,
// installed state detection, and the in-app install button/banner.

let deferredPrompt = null; // saved beforeinstallprompt event
let installBtn = null;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

export function initInstallManager() {
  if (isInStandaloneMode()) return; // already installed — nothing to show

  if (isIOS) {
    _showIOSBanner();
    return;
  }

  // Chrome / Edge / Samsung Browser
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    _showInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    _hideInstallButton();
    deferredPrompt = null;
    _showToast("✓ Video Library installed successfully!");
  });
}

function _showInstallButton() {
  installBtn = document.getElementById("pwa-install-btn");
  if (!installBtn) return;
  installBtn.hidden = false;
  installBtn.addEventListener("click", _triggerInstall);
}

function _hideInstallButton() {
  if (installBtn) installBtn.hidden = true;
}

async function _triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === "accepted") _hideInstallButton();
}

function _showIOSBanner() {
  const banner = document.getElementById("ios-install-banner");
  if (!banner) return;

  // Only show once per session
  if (sessionStorage.getItem("ios-banner-dismissed")) return;

  banner.hidden = false;
  banner.querySelector(".ios-banner-close")?.addEventListener("click", () => {
    banner.hidden = true;
    sessionStorage.setItem("ios-banner-dismissed", "1");
  });
}

function _showToast(msg) {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  region.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
