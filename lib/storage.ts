import type { ApiCallResult, ApiEndpoint, CachedResponse, HistoryItem } from "@/lib/types";

const PREFIX = "spedv-mobile:";
const MAX_CACHED_RESPONSES = 200;
const MAX_RESPONSE_CACHE_BYTES = 3_500_000;
const MAX_SINGLE_RESPONSE_BYTES = 750_000;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value)); } catch { /* Storage quota or private-mode limitation. */ }
}

function serializedSize(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function cacheSafeResult(result: ApiCallResult): ApiCallResult {
  if (!result.binary) return result;
  return {
    ...result,
    data: result.data ?? { message: "Die heruntergeladene Datei wird aus Sicherheits- und Speichergründen nicht offline gespeichert." },
    binary: undefined,
  };
}

export function getFavorites() { return read<string[]>("favorites", []); }
export function setFavorites(value: string[]) { write("favorites", value); }
export function getHistory() { return read<HistoryItem[]>("history", []); }
export function setHistory(value: HistoryItem[]) { write("history", value.slice(0, 100)); }
export function getAuthConfig() { return read<import("@/lib/types").AuthConfig | null>("auth", null); }
export function setAuthConfig(value: import("@/lib/types").AuthConfig) { write("auth", value); }
export function getWriteEnabled() { return read<boolean>("write-enabled", false); }
export function setWriteEnabled(value: boolean) { write("write-enabled", value); }
export function getCustomSpecUrl() { return read<string>("spec-url", ""); }
export function setCustomSpecUrl(value: string) { write("spec-url", value); }
export function getCachedSpec() { return read<Record<string, unknown> | null>("spec", null); }
export function setCachedSpec(value: Record<string, unknown>) { write("spec", value); }
export function getCachedResponses() { return read<Record<string, CachedResponse>>("responses", {}); }
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
export function clearLocalData() {
  if (typeof window === "undefined") return;
  Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).forEach((key) => localStorage.removeItem(key));
}
