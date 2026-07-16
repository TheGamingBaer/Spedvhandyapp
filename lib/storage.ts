import type { ApiCallResult, ApiEndpoint, CachedResponse, HistoryItem } from "@/lib/types";

const PREFIX = "spedv-mobile:";
const MAX_CACHED_RESPONSES = 200;
const MAX_RESPONSE_CACHE_BYTES = 3_500_000;
const MAX_SINGLE_RESPONSE_BYTES = 750_000;
const RESPONSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const memoryFallback = new Map<string, string>();

function storageKey(key: string) {
  return `${PREFIX}${key}`;
}

function remove(key: string) {
  if (typeof window === "undefined") return;
  const fullKey = storageKey(key);
  memoryFallback.delete(fullKey);
  try { localStorage.removeItem(fullKey); } catch { /* Storage may be unavailable in private mode. */ }
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const fullKey = storageKey(key);
  try {
    const raw = localStorage.getItem(fullKey) ?? memoryFallback.get(fullKey);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    remove(key);
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  const fullKey = storageKey(key);
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return;
  }

  try {
    localStorage.setItem(fullKey, serialized);
    memoryFallback.delete(fullKey);
  } catch {
    // Safari private mode, blocked storage and exhausted quota must not make
    // freshly loaded data disappear from the running app session.
    memoryFallback.set(fullKey, serialized);
  }
}

function serializedSize(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function safeErrorMessage(result: ApiCallResult) {
  if (result.upstreamStatus === 401 || result.upstreamStatus === 403) return "Der SPEDV-Hauptschlüssel wurde abgelehnt.";
  if (result.upstreamStatus === 429) return "SPEDV hat zu viele Anfragen erhalten. Bitte später erneut aktualisieren.";
  if (result.upstreamStatus >= 500) return "SPEDV ist vorübergehend nicht erreichbar.";
  return "Dieser Bereich konnte nicht geladen werden.";
}

function cacheSafeResult(result: ApiCallResult): ApiCallResult {
  if (!result.ok) {
    return {
      ...result,
      data: { error: safeErrorMessage(result) },
      binary: undefined,
      headers: {},
    };
  }

  if (!result.binary) return { ...result, headers: {} };
  return {
    ...result,
    data: result.data ?? { message: "Die heruntergeladene Datei wird aus Sicherheits- und Speichergründen nicht offline gespeichert." },
    binary: undefined,
    headers: {},
  };
}

function isCachedResponse(value: unknown): value is CachedResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CachedResponse>;
  return typeof item.endpointId === "string"
    && Boolean(item.endpoint && typeof item.endpoint === "object")
    && Boolean(item.result && typeof item.result === "object")
    && typeof item.result?.timestamp === "string"
    && typeof item.result?.ok === "boolean"
    && typeof item.result?.upstreamStatus === "number";
}

function isFresh(item: CachedResponse, now = Date.now()) {
  const timestamp = Date.parse(item.result.timestamp);
  return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= RESPONSE_CACHE_TTL_MS;
}

export function getFavorites() {
  const value = read<unknown>("favorites", []);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
export function setFavorites(value: string[]) { write("favorites", value); }
export function getHistory() {
  const value = read<unknown>("history", []);
  if (!Array.isArray(value)) {
    remove("history");
    return [];
  }
  return value.filter((item): item is HistoryItem => Boolean(
    item
    && typeof item === "object"
    && typeof (item as HistoryItem).id === "string"
    && typeof (item as HistoryItem).endpointId === "string"
    && typeof (item as HistoryItem).timestamp === "string",
  )).slice(0, 100);
}
export function setHistory(value: HistoryItem[]) { write("history", value.slice(0, 100)); }
export function getAuthConfig() { return read<import("@/lib/types").AuthConfig | null>("auth", null); }
export function setAuthConfig(value: import("@/lib/types").AuthConfig) { write("auth", value); }
export function getWriteEnabled() { return read<boolean>("write-enabled", false) === true; }
export function setWriteEnabled(value: boolean) { write("write-enabled", value); }
export function getCustomSpecUrl() { return read<string>("spec-url", ""); }
export function setCustomSpecUrl(value: string) { write("spec-url", value); }
export function getCachedSpec() {
  const value = read<unknown>("spec", null);
  if (!value || typeof value !== "object" || !("paths" in value)) {
    if (value !== null) remove("spec");
    return null;
  }
  return value as Record<string, unknown>;
}
export function setCachedSpec(value: Record<string, unknown>) { write("spec", value); }
export function getCachedResponses() {
  const raw = read<unknown>("responses", {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    remove("responses");
    return {};
  }

  const current = Object.fromEntries(
    Object.entries(raw).filter(([key, item]) => key.length > 0 && isCachedResponse(item)),
  ) as Record<string, CachedResponse>;
  const fresh = Object.fromEntries(Object.entries(current).filter(([, item]) => isFresh(item)));
  if (Object.keys(fresh).length !== Object.keys(raw).length) write("responses", fresh);
  return fresh;
}
export function setCachedResponse(endpoint: ApiEndpoint, result: ApiCallResult) {
  const current = getCachedResponses();
  const safeResult = cacheSafeResult(result);
  const nextItem: CachedResponse = {
    endpointId: endpoint.id,
    endpoint: { id: endpoint.id, method: endpoint.method, path: endpoint.path, tag: endpoint.tag, summary: endpoint.summary },
    result: safeResult,
  };

  if (serializedSize(nextItem) > MAX_SINGLE_RESPONSE_BYTES) {
    delete current[endpoint.id];
  } else {
    current[endpoint.id] = nextItem;
  }

  const entries = Object.entries(current)
    .filter(([, item]) => isFresh(item))
    .sort((a, b) => String(b[1].result.timestamp).localeCompare(String(a[1].result.timestamp)))
    .slice(0, MAX_CACHED_RESPONSES);

  const retained: Array<[string, CachedResponse]> = [];
  let retainedBytes = 2;
  for (const entry of entries) {
    const entryBytes = serializedSize(entry) + 1;
    if (retainedBytes + entryBytes > MAX_RESPONSE_CACHE_BYTES) continue;
    retained.push(entry);
    retainedBytes += entryBytes;
  }

  write("responses", Object.fromEntries(retained));
}

export function clearAccountData() {
  for (const key of ["favorites", "history", "auth", "write-enabled", "responses"]) remove(key);
}

export function clearLocalData() {
  if (typeof window === "undefined") return;
  for (const key of [...memoryFallback.keys()]) {
    if (key.startsWith(PREFIX)) memoryFallback.delete(key);
  }
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).forEach((key) => localStorage.removeItem(key));
  } catch { /* Storage may be unavailable in private mode. */ }
}
