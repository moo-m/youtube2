// Service worker for the Video Library PWA.
// v4 — Static ad block list (no external fetch) + resilient caching.
// Updated to use a safe, curated list of ad/tracker hostnames.

const CACHE_VERSION = "v4";
const APP_SHELL_CACHE = `vl-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE  = `vl-runtime-${CACHE_VERSION}`;
const RUNTIME_CACHE_MAX = 300;

// ── القائمة الثابتة للإعلانات والمتتبعات (آمنة، لا تشمل googlevideo.com) ──
const AD_BLOCK_HOSTNAMES = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "google-analytics.com",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "static.doubleclick.net",
  "imasdk.googleapis.com",   // SDK الإعلانات التفاعلية
  "2mdn.net",                // شبكة الإعلانات الغنية
  "ads.youtube.com",         // نطاق فرعي مخصص للإعلانات
  "googleads.g.doubleclick.net",
  "tpc.googlesyndication.com",
];

// ── قائمة ملفات التطبيق (كما هي من الكود الأصلي) ──
const APP_SHELL_FILES = [
  "./index.html",
  "./manifest.webmanifest",
  "./main.js",
  "./ai/aiClient.js",
  "./api/youtubeApi.js",
  "./captions/transcriptService.js",
  "./components/aiAssistant.js",
  "./components/toast.js",
  "./components/transcriptPanel.js",
  "./components/videoCard.js",
  "./filters/filters.js",
  "./filters/sorting.js",
  "./library/dailyLog.js",
  "./library/importer.js",
  "./library/libraryQuery.js",
  "./player/customControls.js",
  "./player/videoPlayer.js",
  "./search/search.js",
  "./settings/settingsController.js",
  "./statistics/statistics.js",
  "./storage/bigStore.js",
  "./storage/localStore.js",
  "./storage/repository.js",
  "./styles/ai.css",
  "./styles/base.css",
  "./styles/card.css",
  "./styles/components.css",
  "./styles/containers.css",
  "./styles/customcontrols.css",
  "./styles/dailylog.css",
  "./styles/glass.css",
  "./styles/layout.css",
  "./styles/modal.css",
  "./styles/player.css",
  "./styles/responsive.css",
  "./styles/settings.css",
  "./styles/tokens.css",
  "./styles/transcript.css",
  "./ui/dailyLogView.js",
  "./ui/homeView.js",
  "./ui/modalController.js",
  "./ui/settingsView.js",
  "./ui/shell.js",
  "./ui/sourcesView.js",
  "./ui/statsView.js",
  "./ui/videoView.js",
  "./utils/constants.js",
  "./utils/helpers.js",
  "./utils/youtubeUrl.js",
  "./pwa/installManager.js",
  "./styles/pwa.css",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
];

// ── دالة التحقق من الإعلانات (تفحص النطاقات والمسارات) ──
function isAdRequest(url) {
  try {
    const { hostname, pathname } = new URL(url);

    // 1. فحص النطاقات من القائمة الثابتة
    if (AD_BLOCK_HOSTNAMES.some(h => hostname === h || hostname.endsWith(`.${h}`))) {
      return true;
    }

    // 2. فحص مسارات يوتيوب المباشرة الخاصة بالإعلانات والمتتبعات
    if (hostname.endsWith("youtube.com") &&
        (pathname.startsWith("/ptracking") ||
         pathname.startsWith("/api/stats/ads") ||
         pathname.startsWith("/pagead"))) {
      return true;
    }
  } catch (_) { /* تجاهل أخطاء تحليل الرابط */ }
  return false;
}

// ── Install: تخزين التطبيق بشكل مرن (فشل ملف ≠ فشل التثبيت) ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async cache => {
      const results = await Promise.allSettled(
        APP_SHELL_FILES.map(url =>
          fetch(url, { cache: "reload" })
            .then(res => {
              if (!res.ok) throw new Error(`${res.status} ${url}`);
              return cache.put(url, res);
            })
            .catch(err => console.warn(`[SW] Skipped caching: ${err.message}`))
        )
      );
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed) console.warn(`[SW] ${failed} files skipped during install`);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: حذف الـ caches القديمة والسيطرة على الصفحات ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== APP_SHELL_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── دالة مساعدة لترتيب Cache الصور (حجم محدود) ──
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys  = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  }
}

// ── Fetch: التعامل مع الطلبات ──
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  // منع الإعلانات والمتتبعات
  if (isAdRequest(request.url)) {
    event.respondWith(new Response("", { status: 204, statusText: "Blocked" }));
    return;
  }

  const isSameOrigin = new URL(request.url).origin === self.location.origin;

  // ملفات التطبيق (نفس النطاق): استراتيجية Cache-first
  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(APP_SHELL_CACHE).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // الصور من نطاقات خارجية (مثل مصغرات يوتيوب): استراتيجية stale-while-revalidate
  if (request.destination === "image") {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const fresh  = fetch(request).then(res => {
          if (res.ok) {
            cache.put(request, res.clone());
            trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX);
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
