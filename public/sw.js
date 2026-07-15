const CACHE = "spedv-mobile-shell-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icons/spedv-mobile.svg"];
const MAX_ENTRIES = 60;
const NETWORK_TIMEOUT_MS = 8000;
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "font", "image", "manifest"]);

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((request) => cache.delete(request)));
}

function isCacheable(response) {
  if (!response || !response.ok || (response.type !== "basic" && response.type !== "default")) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl);
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

async function updateAsset(request) {
  try {
    const response = await fetch(request);
    await cacheResponse(request, response);
    return response;
  } catch {
    return undefined;
  }
}

async function handleAsset(event, request) {
  const cached = await caches.match(request);
  const network = updateAsset(request);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  return (await network) || Response.error();
}

function shouldBypass(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.searchParams.has("_rsc") || request.headers.get("rsc") === "1") return true;
  if (request.headers.has("range")) return true;
  return false;
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

  if (shouldBypass(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;
  event.respondWith(handleAsset(event, request));
});
