"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  Blocks,
  BookOpen,
  Box,
  ChevronRight,
  CircleGauge,
  Clock3,
  Database,
  Download,
  Eye,
  FileJson,
  FolderKanban,
  Gauge,
  HardDrive,
  Heart,
  History,
  Home,
  KeyRound,
  Layers3,
  ListFilter,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  PackageSearch,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  UploadCloud,
  UserRound,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EndpointSheet } from "@/components/endpoint-sheet";
import { hasRequiredPathParameters, parseOpenApi, titleCase } from "@/lib/openapi";
import {
  clearLocalData,
  getAuthConfig,
  getCachedResponses,
  getCachedSpec,
  getCustomSpecUrl,
  getFavorites,
  getHistory,
  getWriteEnabled,
  setAuthConfig,
  setCachedResponse,
  setCachedSpec,
  setCustomSpecUrl,
  setFavorites,
  setHistory,
  setWriteEnabled,
} from "@/lib/storage";
import type { ApiCallResult, ApiEndpoint, AuthConfig, CachedResponse, HistoryItem } from "@/lib/types";
import { clearApiKey, loadApiKey, saveApiKey } from "@/lib/vault";

type Tab = "home" | "areas" | "api" | "history" | "settings";

const iconByTag = [Truck, Route, UserRound, Archive, FolderKanban, Box, Database, Layers3, PackageSearch, Wrench];

function numberOfRecords(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["items", "data", "results", "records", "entries", "value"]) {
      if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
    }
    for (const key of ["count", "total", "totalCount", "recordCount"]) {
      if (typeof record[key] === "number") return record[key] as number;
    }
  }
  return null;
}

function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function authLabel(auth: AuthConfig | null) {
  if (!auth) return "Nicht erkannt";
  if (auth.mode === "bearer") return "Bearer Token";
  return `${auth.name} · ${auth.mode === "query" ? "Query" : "Header"}`;
}

async function proxyCall(endpoint: ApiEndpoint, apiKey: string, auth: AuthConfig): Promise<ApiCallResult> {
  const response = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: endpoint.path,
      method: endpoint.method.toUpperCase(),
      query: {},
      headers: {},
      auth: { ...auth, key: apiKey },
    }),
  });
  return response.json();
}

export function SpedvApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [specError, setSpecError] = useState("");
  const [specLoading, setSpecLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [online, setOnline] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("Alle");
  const [favoritesState, setFavoritesState] = useState<string[]>([]);
  const [historyState, setHistoryState] = useState<HistoryItem[]>([]);
  const [cachedResponses, setCachedResponses] = useState<Record<string, CachedResponse>>({});
  const [writeAccess, setWriteAccess] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanDone, setScanDone] = useState(0);
  const [customSpec, setCustomSpec] = useState("");
  const [installHintHidden, setInstallHintHidden] = useState(false);

  const parsed = useMemo(() => spec ? parseOpenApi(spec) : null, [spec]);
  const endpoints = parsed?.endpoints || [];
  const tags = useMemo(() => [...new Set(endpoints.map((endpoint) => endpoint.tag))].sort((a, b) => a.localeCompare(b)), [endpoints]);
  const grouped = useMemo(() => Object.fromEntries(tags.map((tag) => [tag, endpoints.filter((endpoint) => endpoint.tag === tag)])), [tags, endpoints]);
  const filteredEndpoints = useMemo(() => {
    const query = search.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      const matchesTag = selectedTag === "Alle" || selectedTag === "Favoriten" && favoritesState.includes(endpoint.id) || endpoint.tag === selectedTag;
      if (!matchesTag) return false;
      if (!query) return true;
      return [endpoint.summary, endpoint.path, endpoint.tag, endpoint.method, endpoint.operationId || ""].some((value) => value.toLowerCase().includes(query));
    });
  }, [endpoints, favoritesState, search, selectedTag]);

  const cachedList = useMemo(() => Object.values(cachedResponses).sort((a, b) => b.result.timestamp.localeCompare(a.result.timestamp)), [cachedResponses]);
  const successfulCached = cachedList.filter((item) => item.result.ok).length;
  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    setFavoritesState(getFavorites());
    setHistoryState(getHistory());
    setCachedResponses(getCachedResponses());
    setWriteAccess(getWriteEnabled());
    const savedSpecUrl = getCustomSpecUrl();
    setCustomSpec(savedSpecUrl);

    void (async () => {
      const savedKey = await loadApiKey();
      const savedAuth = getAuthConfig();
      await loadSpec(savedSpecUrl, true);
      if (savedKey) {
        setApiKey(savedKey);
        if (savedAuth) {
          setAuth(savedAuth);
          setConnected(true);
        }
      }
    })();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (connected && auth && apiKey && endpoints.length && cachedList.length === 0 && !scanRunning) void runAutoScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, auth, apiKey, endpoints.length]);

  async function loadSpec(url = customSpec, useCache = false) {
    setSpecLoading(true);
    setSpecError("");
    try {
      const target = url ? `/api/openapi?url=${encodeURIComponent(url)}` : "/api/openapi";
      const response = await fetch(target, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.paths) throw new Error(body?.error || "OpenAPI-Schema nicht verfügbar.");
      setSpec(body);
      setCachedSpec(body);
      if (url) {
        setCustomSpecUrl(url);
        setCustomSpec(url);
      }
    } catch (error) {
      const cached = useCache ? getCachedSpec() : null;
      if (cached?.paths) setSpec(cached);
      else setSpecError(error instanceof Error ? error.message : "OpenAPI-Schema nicht verfügbar.");
    } finally {
      setSpecLoading(false);
    }
  }

  async function detectAuth(key: string): Promise<AuthConfig> {
    if (!parsed) throw new Error("Die API-Beschreibung ist noch nicht geladen.");
    const probes = endpoints
      .filter((endpoint) => endpoint.method === "get" && !hasRequiredPathParameters(endpoint) && !endpoint.parameters.some((parameter) => parameter.required && ["query", "header"].includes(parameter.in)))
      .sort((a, b) => {
        const rank = (endpoint: ApiEndpoint) => /status|version|profile|user|account|company|dashboard|overview/i.test(`${endpoint.path} ${endpoint.summary}`) ? 0 : 1;
        return rank(a) - rank(b);
      })
      .slice(0, 3);

    if (!probes.length) return parsed.authCandidates[0] || { mode: "header", name: "X-API-Key", source: "detected" };

    for (const candidate of parsed.authCandidates) {
      for (const probe of probes) {
        try {
          const result = await proxyCall(probe, key, candidate);
          if (result.upstreamStatus > 0 && ![401, 403].includes(result.upstreamStatus)) return { ...candidate, source: candidate.source === "openapi" ? "openapi" : "detected" };
        } catch {
          // Try the next candidate.
        }
      }
    }
    throw new Error("Der API-Key wurde von SPEDV abgelehnt oder die Authentifizierung konnte nicht automatisch erkannt werden.");
  }

  async function connect() {
    const key = keyInput.trim();
    if (!key) {
      setConnectionError("Trage deinen SPEDV-API-Key ein.");
      return;
    }
    if (!parsed) {
      setConnectionError("Die SPEDV-API-Beschreibung konnte noch nicht geladen werden.");
      return;
    }

    setConnecting(true);
    setConnectionError("");
    try {
      const detected = await detectAuth(key);
      await saveApiKey(key);
      setAuthConfig(detected);
      setApiKey(key);
      setAuth(detected);
      setConnected(true);
      setKeyInput("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Verbindung fehlgeschlagen.");
    } finally {
      setConnecting(false);
    }
  }

  async function runAutoScan() {
    if (!auth || !apiKey || scanRunning) return;
    const candidates = endpoints
      .filter((endpoint) => endpoint.method === "get" && !hasRequiredPathParameters(endpoint) && !endpoint.parameters.some((parameter) => parameter.required && ["query", "header"].includes(parameter.in)))
      .sort((a, b) => {
        const score = (endpoint: ApiEndpoint) => {
          const text = `${endpoint.tag} ${endpoint.summary} ${endpoint.path}`;
          if (/dashboard|overview|status|profile|company|order|tour|vehicle|driver|shipment|transport/i.test(text)) return 0;
          return 1;
        };
        return score(a) - score(b);
      })
      .slice(0, 12);

    setScanRunning(true);
    setScanDone(0);
    for (let index = 0; index < candidates.length; index += 3) {
      const chunk = candidates.slice(index, index + 3);
      await Promise.all(chunk.map(async (endpoint) => {
        try {
          const result = await proxyCall(endpoint, apiKey, auth);
          if (result.upstreamStatus > 0 && result.upstreamStatus < 500) setCachedResponse(endpoint, result);
        } catch {
          // A single endpoint must not stop discovery.
        } finally {
          setScanDone((current) => current + 1);
        }
      }));
      setCachedResponses(getCachedResponses());
    }
    setScanRunning(false);
  }

  function onExecuted(endpoint: ApiEndpoint, result: ApiCallResult) {
    setCachedResponse(endpoint, result);
    setCachedResponses(getCachedResponses());
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      endpointId: endpoint.id,
      method: endpoint.method.toUpperCase(),
      path: endpoint.path,
      summary: endpoint.summary,
      status: result.upstreamStatus,
      ok: result.ok,
      elapsedMs: result.elapsedMs,
      timestamp: result.timestamp,
    };
    const next = [item, ...historyState].slice(0, 100);
    setHistoryState(next);
    setHistory(next);
  }

  function toggleFavorite(endpointId: string) {
    const next = favoritesState.includes(endpointId) ? favoritesState.filter((id) => id !== endpointId) : [...favoritesState, endpointId];
    setFavoritesState(next);
    setFavorites(next);
  }

  async function disconnect() {
    await clearApiKey();
    setApiKey("");
    setConnected(false);
    setAuth(null);
    setKeyInput("");
    setTab("home");
  }

  function openTag(tag: string) {
    setSelectedTag(tag);
    setSearch("");
    setTab("api");
  }

  if (specLoading && !spec) return <LoadingScreen />;

  if (!connected) {
    return (
      <main className="app-shell setup">
        <section className="setup-card">
          <div className="setup-logo">SV</div>
          <div className="eyebrow">Private iPhone App</div>
          <h1>SPEDV.<br />Komplett neu gedacht.</h1>
          <p className="lead">Eine aufgeräumte Oberfläche für die vollständige SPEDV-API. Dein Schlüssel wird einmalig eingegeben und lokal auf diesem Gerät verschlüsselt gespeichert.</p>

          {specError && (
            <div className="notice error" style={{ margin: "18px 0" }}>
              <AlertTriangle size={18} />
              <div><strong>API-Beschreibung nicht erreichbar</strong><br />{specError}</div>
            </div>
          )}

          <div className="grid" style={{ gap: 12, marginTop: 22 }}>
            <label className="input-wrap">
              <span className="label">SPEDV API-Key</span>
              <div style={{ position: "relative" }}>
                <KeyRound size={17} style={{ position: "absolute", left: 14, top: 15, color: "var(--muted)" }} />
                <input className="input" style={{ paddingLeft: 43 }} type="password" autoComplete="off" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder="API-Key einmalig einfügen" onKeyDown={(event) => event.key === "Enter" && void connect()} />
              </div>
            </label>
            <button className="button" disabled={connecting || !parsed} onClick={() => void connect()}>
              {connecting ? <span className="spinner" /> : <Sparkles size={17} />}
              {connecting ? "Authentifizierung wird erkannt" : "App einrichten"}
            </button>
          </div>

          {connectionError && <div className="notice error" style={{ marginTop: 13 }}><AlertTriangle size={18} />{connectionError}</div>}

          <details style={{ marginTop: 19 }}>
            <summary className="label" style={{ cursor: "pointer" }}>Erweiterte API-Einstellung</summary>
            <div className="grid" style={{ gap: 10, marginTop: 10 }}>
              <input className="input" value={customSpec} onChange={(event) => setCustomSpec(event.target.value)} placeholder="https://api.sped-v.de/swagger/v1/swagger.json" />
              <button className="button secondary" onClick={() => void loadSpec(customSpec)}><RefreshCw size={16} /> OpenAPI neu laden</button>
            </div>
          </details>

          <div className="notice" style={{ marginTop: 18 }}><LockKeyhole size={18} />Der Schlüssel wird per AES-GCM verschlüsselt und bleibt im lokalen App-Speicher dieses iPhones.</div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">SV</div>
          <div className="brand-copy">
            <div className="brand-title">SPEDV Mobile</div>
            <div className="brand-subtitle">{parsed?.title} {parsed?.version ? `· ${parsed.version}` : ""}</div>
          </div>
        </div>
        <div className={`status-pill ${online ? "online" : "error"}`}>
          <span className="status-dot" />
          {online ? "Live" : "Offline"}
        </div>
      </header>

      {tab === "home" && (
        <section className="page">
          <div className="hero">
            <div className="eyebrow">Command Center</div>
            <h1>Alles von SPEDV.<br />Einfach im Griff.</h1>
            <p className="lead">Die komplette API in einer Oberfläche: automatisch sortiert, durchsuchbar, exportierbar und auf dein iPhone optimiert.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button className="button" onClick={() => { setSelectedTag("Alle"); setTab("api"); }}><PackageSearch size={17} /> Alle Endpunkte</button>
              <button className="button secondary" disabled={scanRunning} onClick={() => void runAutoScan()}>{scanRunning ? <span className="spinner" /> : <RefreshCw size={17} />} {scanRunning ? `${scanDone} geprüft` : "Daten aktualisieren"}</button>
            </div>
          </div>

          {!isStandalone && !installHintHidden && (
            <div className="notice section">
              <UploadCloud size={19} />
              <div style={{ flex: 1 }}><strong>Als echte iPhone-App öffnen</strong><br />In Safari „Teilen“ und anschließend „Zum Home-Bildschirm“ wählen.</div>
              <button className="button ghost icon-button" onClick={() => setInstallHintHidden(true)}><X size={16} /></button>
            </div>
          )}

          <div className="grid stats">
            <StatCard icon={Blocks} value={endpoints.length} label="API-Endpunkte" />
            <StatCard icon={Layers3} value={tags.length} label="Bereiche" />
            <StatCard icon={HardDrive} value={cachedList.length} label="Live-Ansichten" />
            <StatCard icon={Activity} value={successfulCached} label="Erfolgreich geladen" />
          </div>

          <div className="section">
            <div className="section-head">
              <div><h2>Bereiche</h2><div className="section-copy">Automatisch aus der SPEDV-API gruppiert</div></div>
              <button className="button ghost" onClick={() => setTab("areas")}>Alle ansehen <ChevronRight size={15} /></button>
            </div>
            <div className="grid three">
              {tags.slice(0, 6).map((tag, index) => {
                const Icon = iconByTag[index % iconByTag.length];
                const tagEndpoints = grouped[tag] || [];
                const live = cachedList.find((item) => item.endpoint.tag === tag);
                const records = live ? numberOfRecords(live.result.data) : null;
                return (
                  <button className="card pad interactive" style={{ textAlign: "left" }} key={tag} onClick={() => openTag(tag)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div className="stat-icon"><Icon size={17} /></div>
                      <span className="badge">{tagEndpoints.length} APIs</span>
                    </div>
                    <h3 style={{ marginTop: 16 }}>{titleCase(tag)}</h3>
                    <div className="section-copy">{records !== null ? `${records} Einträge zuletzt geladen` : "Bereich öffnen und Daten laden"}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="section">
            <div className="section-head"><div><h2>Zuletzt geladen</h2><div className="section-copy">Schneller Zugriff auf aktuelle Antworten</div></div></div>
            {cachedList.length ? (
              <div className="endpoint-list">
                {cachedList.slice(0, 6).map((item) => {
                  const endpoint = endpoints.find((candidate) => candidate.id === item.endpointId);
                  if (!endpoint) return null;
                  const count = numberOfRecords(item.result.data);
                  return (
                    <button className="endpoint" key={item.endpointId} onClick={() => setSelectedEndpoint(endpoint)}>
                      <span className={`method ${endpoint.method}`}>{endpoint.method.toUpperCase()}</span>
                      <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{endpoint.summary}</span><span className="endpoint-path" style={{ display: "block" }}>{endpoint.tag} · {formatTime(item.result.timestamp)}{count !== null ? ` · ${count} Einträge` : ""}</span></span>
                      <ChevronRight size={17} color="var(--muted)" />
                    </button>
                  );
                })}
              </div>
            ) : <EmptyState icon={CircleGauge} title={scanRunning ? "SPEDV wird analysiert" : "Noch keine Daten geladen"} copy={scanRunning ? `${scanDone} API-Bereiche wurden geprüft.` : "Starte die automatische Aktualisierung oder öffne einen API-Endpunkt."} />}
          </div>
        </section>
      )}

      {tab === "areas" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Struktur</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>Alle Bereiche</h1><div className="section-copy">{tags.length} Kategorien aus der aktuellen API-Beschreibung</div></div></div>
          <div className="grid two">
            {tags.map((tag, index) => {
              const Icon = iconByTag[index % iconByTag.length];
              const list = grouped[tag] || [];
              const methodCounts = list.reduce<Record<string, number>>((acc, endpoint) => ({ ...acc, [endpoint.method]: (acc[endpoint.method] || 0) + 1 }), {});
              return (
                <button className="card pad interactive" key={tag} style={{ textAlign: "left" }} onClick={() => openTag(tag)}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div className="stat-icon"><Icon size={18} /></div><div><h3>{titleCase(tag)}</h3><div className="section-copy">{list.length} Endpunkte</div></div></div>
                    <ChevronRight size={18} color="var(--muted)" />
                  </div>
                  <div className="chip-row" style={{ marginTop: 14 }}>
                    {Object.entries(methodCounts).map(([method, count]) => <span className={`method ${method}`} key={method}>{method.toUpperCase()} {count}</span>)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tab === "api" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Vollständiger Katalog</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>SPEDV API</h1><div className="section-copy">{filteredEndpoints.length} von {endpoints.length} Endpunkten</div></div></div>
          <div className="search"><Search size={17} /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aufträge, Fahrer, Fahrzeuge, Dokumente …" /></div>
          <div className="chip-row" style={{ marginTop: 12 }}>
            {(["Alle", "Favoriten", ...tags] as string[]).map((tag) => <button className={`chip ${selectedTag === tag ? "active" : ""}`} key={tag} onClick={() => setSelectedTag(tag)}>{tag === "Favoriten" && <Star size={13} />} {tag}</button>)}
          </div>
          <div className="endpoint-list section">
            {filteredEndpoints.map((endpoint) => (
              <div className="endpoint" key={endpoint.id} role="button" tabIndex={0} onClick={() => setSelectedEndpoint(endpoint)} onKeyDown={(event) => event.key === "Enter" && setSelectedEndpoint(endpoint)}>
                <span className={`method ${endpoint.method}`}>{endpoint.method.toUpperCase()}</span>
                <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{endpoint.summary}</span><span className="endpoint-path" style={{ display: "block" }}>{endpoint.path}</span></span>
                <button className="button ghost icon-button" aria-label="Favorit" onClick={(event) => { event.stopPropagation(); toggleFavorite(endpoint.id); }}><Star size={17} fill={favoritesState.includes(endpoint.id) ? "currentColor" : "none"} color={favoritesState.includes(endpoint.id) ? "var(--accent)" : "var(--muted)"} /></button>
              </div>
            ))}
          </div>
          {!filteredEndpoints.length && <EmptyState icon={Search} title="Nichts gefunden" copy="Passe Suche oder Filter an." />}
        </section>
      )}

      {tab === "history" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Aktivität</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>Verlauf</h1><div className="section-copy">Die letzten 100 manuellen API-Aufrufe</div></div></div>
          {historyState.length ? (
            <div className="endpoint-list">
              {historyState.map((item) => {
                const endpoint = endpoints.find((candidate) => candidate.id === item.endpointId);
                return (
                  <button className="endpoint" key={item.id} onClick={() => endpoint && setSelectedEndpoint(endpoint)} disabled={!endpoint}>
                    <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
                    <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{item.summary}</span><span className="endpoint-path" style={{ display: "block" }}>{formatTime(item.timestamp)} · {item.elapsedMs} ms · {item.path}</span></span>
                    <span className={`badge ${item.ok ? "good" : "bad"}`}>{item.status || "ERR"}</span>
                  </button>
                );
              })}
            </div>
          ) : <EmptyState icon={History} title="Noch kein Verlauf" copy="Manuell ausgeführte API-Aufrufe erscheinen hier." />}
        </section>
      )}

      {tab === "settings" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Konfiguration</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>Einstellungen</h1><div className="section-copy">Sicherheit, API und Gerätespeicher</div></div></div>

          <div className="card pad">
            <div className="settings-row">
              <div><div className="settings-title">API-Verbindung</div><div className="settings-desc">{authLabel(auth)} · Schlüssel lokal verschlüsselt</div></div>
              <span className="badge good"><ShieldCheck size={13} /> Aktiv</span>
            </div>
            <div className="settings-row">
              <div><div className="settings-title">Schreibende Aktionen</div><div className="settings-desc">POST, PUT, PATCH und DELETE erlauben. Jede Aktion muss zusätzlich bestätigt werden.</div></div>
              <button className={`toggle ${writeAccess ? "on" : ""}`} aria-label="Schreibzugriff umschalten" onClick={() => { const next = !writeAccess; setWriteAccess(next); setWriteEnabled(next); }} />
            </div>
            <div className="settings-row">
              <div><div className="settings-title">API-Beschreibung</div><div className="settings-desc">{endpoints.length} Endpunkte · {parsed?.version || "Version unbekannt"}</div></div>
              <button className="button secondary icon-button" disabled={specLoading} onClick={() => void loadSpec(customSpec)}>{specLoading ? <span className="spinner" /> : <RefreshCw size={17} />}</button>
            </div>
            <div className="settings-row">
              <div><div className="settings-title">Live-Daten aktualisieren</div><div className="settings-desc">Sichere GET-Endpunkte automatisch prüfen und lokal zwischenspeichern.</div></div>
              <button className="button secondary" disabled={scanRunning} onClick={() => void runAutoScan()}>{scanRunning ? `${scanDone} geprüft` : "Starten"}</button>
            </div>
          </div>

          <div className="card pad section">
            <h3>Erweiterte OpenAPI-Quelle</h3>
            <p className="section-copy">Nur ändern, wenn SPEDV einen anderen Swagger-Pfad vorgibt.</p>
            <div className="grid" style={{ gap: 10, marginTop: 12 }}>
              <input className="input" value={customSpec} onChange={(event) => setCustomSpec(event.target.value)} placeholder="Automatische Erkennung" />
              <button className="button secondary" onClick={() => void loadSpec(customSpec)}><FileJson size={16} /> Schema laden</button>
            </div>
          </div>

          <div className="card pad section">
            <h3>Lokaler Speicher</h3>
            <p className="section-copy">API-Antworten, Favoriten und Verlauf bleiben nur auf diesem Gerät.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 13 }}>
              <button className="button secondary" onClick={() => { clearLocalData(); setHistoryState([]); setCachedResponses({}); setFavoritesState([]); }}><Database size={16} /> Lokale Daten löschen</button>
              <button className="button danger" onClick={() => void disconnect()}><LogOut size={16} /> API-Key entfernen</button>
            </div>
          </div>

          <div className="notice section"><ShieldCheck size={18} />Der API-Key wird nicht in GitHub, Vercel, Umgebungsvariablen oder im Quellcode gespeichert. Er verlässt dein Gerät nur verschlüsselt per HTTPS im jeweiligen SPEDV-Aufruf.</div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Hauptnavigation">
        <NavItem icon={Home} label="Start" active={tab === "home"} onClick={() => setTab("home")} />
        <NavItem icon={Blocks} label="Bereiche" active={tab === "areas"} onClick={() => setTab("areas")} />
        <NavItem icon={ListFilter} label="API" active={tab === "api"} onClick={() => setTab("api")} />
        <NavItem icon={Clock3} label="Verlauf" active={tab === "history"} onClick={() => setTab("history")} />
        <NavItem icon={Settings} label="Einstellungen" active={tab === "settings"} onClick={() => setTab("settings")} />
      </nav>

      {selectedEndpoint && auth && (
        <EndpointSheet
          endpoint={selectedEndpoint}
          apiKey={apiKey}
          auth={auth}
          writeEnabled={writeAccess}
          cachedResult={cachedResponses[selectedEndpoint.id]?.result}
          onClose={() => setSelectedEndpoint(null)}
          onExecuted={onExecuted}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="app-shell setup">
      <section className="setup-card">
        <div className="setup-logo">SV</div>
        <div className="eyebrow">Initialisierung</div>
        <h1>SPEDV Mobile</h1>
        <p className="lead">API-Struktur und lokalen Gerätespeicher werden vorbereitet.</p>
        <div className="grid" style={{ gap: 12, marginTop: 20 }}>
          <div className="skeleton" style={{ height: 48 }} />
          <div className="skeleton" style={{ height: 48 }} />
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, value, label }: { icon: typeof Gauge; value: string | number; label: string }) {
  return <div className="card stat-card"><div className="stat-icon"><Icon size={17} /></div><div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div></div>;
}

function EmptyState({ icon: Icon, title, copy }: { icon: typeof Eye; title: string; copy: string }) {
  return <div className="card empty"><div className="empty-icon"><Icon size={23} /></div><h3>{title}</h3><div className="section-copy">{copy}</div></div>;
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{label}</span></button>;
}
