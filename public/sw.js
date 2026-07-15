const CACHE = "spedv-mobile-shell-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icons/spedv-mobile.svg"];
const MAX_ENTRIES = 60;
const NETWORK_TIMEOUT_MS = 8000;

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((request) => cache.delete(request)));
}

function isCacheable(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}

async function cacheResponse(request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  await trimCache(cache);
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetchWithTimeout(request);
    await cacheResponse("/", response);
    return response;
  } catch {
    return (await caches.match("/")) || Response.error();
  }
}

async function handleAsset(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      await cacheResponse(request, response);
      return response;
    })
    .catch(() => undefined);

  return cached || (await network) || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});
