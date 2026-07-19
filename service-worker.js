// Service worker for the Video Library PWA.
// v3 — Dynamic ad list fetching + resilient fallback + offline support.

const CACHE_VERSION = "v3";
const APP_SHELL_CACHE = `vl-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE  = `vl-runtime-${CACHE_VERSION}`;
const AD_LIST_CACHE  = `vl-adlist-${CACHE_VERSION}`; // Cache مخصص لقائمة الإعلانات
const RUNTIME_CACHE_MAX = 300;

// الرابط الخارجي للقائمة المُحدّثة (مصدر مفتوح وموثوق)
const REMOTE_AD_LIST_URL = "https://raw.githubusercontent.com/kboghdady/youTube_ads_4_pi-hole/master/black.list";

// --- القائمة الثابتة (احتياطي أساسي في حال تعذر الجلب) ---
const STATIC_AD_BLOCK_HOSTNAMES = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "google-analytics.com",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "static.doubleclick.net",
  "imasdk.googleapis.com",   // SDK الإعلانات التفاعلية (الأكثر ظهوراً)
  "2mdn.net",                // شبكة الإعلانات الغنية
  "ads.youtube.com",         // نطاق فرعي مخصص للإعلانات
];

// --- المتغير العمومي للقائمة الديناميكية (يُملأ أثناء التشغيل) ---
let dynamicAdHostnames = [];

// ── ملفات التطبيق (كما هي من الكود الأصلي) ──
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

// ── دالة تحديث قائمة الإعلانات من الإنترنت ──
async function refreshAdList() {
  try {
    const cache = await caches.open(AD_LIST_CACHE);
    // محاولة جلب أحدث قائمة (تجاهل Cache المتصفح مؤقتاً)
    const response = await fetch(REMOTE_AD_LIST_URL, { cache: "reload" });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    // تخزين النسخة الجديدة في Cache المخصص
    await cache.put(REMOTE_AD_LIST_URL, response.clone());
    
    // قراءة النص وتحويله إلى مصفوفة (كل سطر = نطاق)
    const text = await response.text();
    const lines = text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith("#")); // استبعاد التعليقات
    
    if (lines.length > 0) {
      dynamicAdHostnames = lines;
      console.log(`[SW] ✅ تم تحديث قائمة الإعلانات: ${dynamicAdHostnames.length} نطاق`);
    } else {
      throw new Error("القائمة المستوردة فارغة");
    }
  } catch (error) {
    console.warn(`[SW] ⚠️ فشل جلب القائمة الخارجية، سيتم استخدام القائمة الثابتة: ${error.message}`);
    // في حال الفشل، نحمّل القائمة الثابتة كحل أخير
    dynamicAdHostnames = STATIC_AD_BLOCK_HOSTNAMES;
  }
}

// ── دالة التحقق من الإعلانات (ذكية ومدمجة) ──
function isAdRequest(url) {
  try {
    const { hostname, pathname } = new URL(url);
    
    // 1. الفحص باستخدام القائمة الديناميكية (الأحدث)
    if (dynamicAdHostnames.some(h => hostname === h || hostname.endsWith(`.${h}`))) {
      return true;
    }
    
    // 2. الفحص باستخدام القائمة الثابتة (احتياطي إضافي)
    if (STATIC_AD_BLOCK_HOSTNAMES.some(h => hostname === h || hostname.endsWith(`.${h}`))) {
      return true;
    }
    
    // 3. الفحص الذكي لمسارات يوتيوب المباشرة (من كودك الأصلي)
    if (hostname.endsWith("youtube.com") &&
        (pathname.startsWith("/ptracking") ||
         pathname.startsWith("/api/stats/ads") ||
         pathname.startsWith("/pagead"))) {
      return true;
    }
    
  } catch (_) { /* تجاهل الأخطاء في تحليل الرابط */ }
  return false;
}

// ── Install: تخزين التطبيق + تجهيز القائمة في الخلفية ──
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      // 1. تخزين ملفات التطبيق بشكل مرن (فشل ملف لا يوقف التثبيت)
      const cache = await caches.open(APP_SHELL_CACHE);
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
      
      // 2. بدء تحديث قائمة الإعلانات (لا ننتظرها حتى لا نعطل التثبيت)
      refreshAdList();
    })().then(() => self.skipWaiting())
  );
});

// ── Activate: تنظيف القديم + تحديث القائمة فوراً ──
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      // حذف جميع الـ Caches القديمة ما عدا الثلاثة الجديدة
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== APP_SHELL_CACHE && k !== RUNTIME_CACHE && k !== AD_LIST_CACHE)
          .map(k => caches.delete(k))
      );
      
      // تحديث قائمة الإعلانات فور التنشيط وانتظارها لضمان جاهزيتها
      await refreshAdList();
      
      // السيطرة على جميع الصفحات المفتوحة
      await self.clients.claim();
    })()
  );
});

// ── دالة مساعدة لترتيب Cache الصور (حتى لا يتجاوز الحد الأقصى) ──
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

  // 🔥 منع الإعلانات (باستخدام القوائم المدمجة والديناميكية)
  if (isAdRequest(request.url)) {
    event.respondWith(new Response("", { status: 204, statusText: "Blocked" }));
    return;
  }

  const isSameOrigin = new URL(request.url).origin === self.location.origin;

  // App shell (ملفات التطبيق): استراتيجية Cache-first
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

  // الصور من نطاقات خارجية (مثل مصغرات الفيديو): استراتيجية stale-while-revalidate
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
