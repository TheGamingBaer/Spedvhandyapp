"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  Blocks,
  ChevronRight,
  Clock3,
  Database,
  FolderKanban,
  Gauge,
  HardDrive,
  Home,
  KeyRound,
  Layers3,
  ListFilter,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  UploadCloud,
  UserRound,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EndpointSheet } from "@/components/endpoint-sheet";
import { ModuleSheet } from "@/components/module-sheet";
import { parseOpenApi } from "@/lib/openapi";
import { buildSpedvModules, canLoadAutomatically } from "@/lib/spedv-modules";
import type { ResolvedSpedvModule, SpedvModuleIcon } from "@/lib/spedv-modules";
import {
  clearLocalData,
  getCachedResponses,
  getCachedSpec,
  getHistory,
  getWriteEnabled,
  setAuthConfig,
  setCachedResponse,
  setCachedSpec,
  setHistory,
  setWriteEnabled,
} from "@/lib/storage";
import type { ApiCallResult, ApiEndpoint, AuthConfig, CachedResponse, HistoryItem } from "@/lib/types";
import { clearApiKey, loadApiKey, saveApiKey } from "@/lib/vault";

type Tab = "home" | "areas" | "history" | "settings";

const OFFICIAL_AUTH: AuthConfig = {
  mode: "header",
  name: "X-Api-Key",
  source: "openapi",
};

const MODULE_ICONS: Record<SpedvModuleIcon, typeof Gauge> = {
  profile: UserRound,
  company: Truck,
  orders: Route,
  vehicles: Truck,
  drivers: UserRound,
  online: Activity,
  stats: Gauge,
  vacations: Archive,
  bank: Database,
  documents: FolderKanban,
  generic: Layers3,
};

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
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function resultError(result: ApiCallResult) {
  const data = result.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message", "detail", "title"]) {
      if (typeof record[key] === "string" && record[key]) return record[key] as string;
    }
  }
  if (result.upstreamStatus === 401 || result.upstreamStatus === 403) return "Der SPEDV-Key wurde abgelehnt.";
  return `SPEDV antwortet mit Status ${result.upstreamStatus || "ERR"}.`;
}

async function proxyCall(endpoint: ApiEndpoint, apiKey: string): Promise<ApiCallResult> {
  const response = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: endpoint.path,
      method: endpoint.method.toUpperCase(),
      query: {},
      headers: {},
      auth: { ...OFFICIAL_AUTH, key: apiKey },
    }),
  });
  const result = await response.json() as ApiCallResult;
  if (!result || typeof result.upstreamStatus !== "number") throw new Error("Die SPEDV-Antwort konnte nicht verarbeitet werden.");
  return result;
}

function validationEndpoint(endpoints: ApiEndpoint[]) {
  const preferred = ["/v1/auth/claims/apikey", "/v1/user", "/v1/spedition/accounts"];
  for (const path of preferred) {
    const endpoint = endpoints.find((candidate) => candidate.method === "get" && candidate.path.toLowerCase() === path);
    if (endpoint) return endpoint;
  }
  return endpoints.find(canLoadAutomatically);
}

function uniqueEndpoints(endpoints: ApiEndpoint[]) {
  return endpoints.filter((endpoint, index) => endpoints.findIndex((candidate) => candidate.id === endpoint.id) === index);
}

export function SpedvApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [specLoading, setSpecLoading] = useState(true);
  const [specWarning, setSpecWarning] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [online, setOnline] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ResolvedSpedvModule | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [search, setSearch] = useState("");
  const [historyState, setHistoryState] = useState<HistoryItem[]>([]);
  const [cachedResponses, setCachedResponses] = useState<Record<string, CachedResponse>>({});
  const [writeAccess, setWriteAccess] = useState(false);
  const [loadingEndpointIds, setLoadingEndpointIds] = useState<string[]>([]);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [installHintHidden, setInstallHintHidden] = useState(false);
  const automaticRefreshStarted = useRef(false);

  const parsed = useMemo(() => spec ? parseOpenApi(spec) : null, [spec]);
  const endpoints = parsed?.endpoints || [];
  const modules = useMemo(() => buildSpedvModules(endpoints), [endpoints]);
  const automaticEndpoints = useMemo(
    () => uniqueEndpoints(modules.flatMap((module) => module.automaticEndpoints)),
    [modules],
  );
  const filteredModules = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return modules;
    return modules.filter((module) => [module.title, module.description, ...module.endpoints.map((endpoint) => `${endpoint.summary} ${endpoint.path}`)]
      .some((value) => value.toLowerCase().includes(query)));
  }, [modules, search]);

  const cachedList = useMemo(
    () => Object.values(cachedResponses).sort((a, b) => b.result.timestamp.localeCompare(a.result.timestamp)),
    [cachedResponses],
  );
  const successfulCached = cachedList.filter((item) => item.result.ok).length;
  const failedCached = cachedList.filter((item) => !item.result.ok).length;
  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    setHistoryState(getHistory());
    setCachedResponses(getCachedResponses());
    setWriteAccess(getWriteEnabled());

    void (async () => {
      const loadedSpec = await loadSpec();
      const savedKey = await loadApiKey();
      if (savedKey && loadedSpec) await connectWithKey(savedKey, loadedSpec, true);
    })();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected || !apiKey || !automaticEndpoints.length || automaticRefreshStarted.current) return;
    automaticRefreshStarted.current = true;
    void refreshEndpoints(automaticEndpoints, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, apiKey, automaticEndpoints.length]);

  async function loadSpec(): Promise<Record<string, unknown> | null> {
    setSpecLoading(true);
    setSpecWarning("");
    try {
      const response = await fetch("/api/openapi", { cache: "no-store" });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok || !body?.paths) throw new Error("Die SPEDV-Struktur konnte nicht geladen werden.");
      setSpec(body);
      setCachedSpec(body);
      return body;
    } catch (error) {
      const cached = getCachedSpec();
      if (cached?.paths) {
        setSpec(cached);
        setSpecWarning("Die gespeicherte SPEDV-Struktur wird verwendet. Live-Aktualisierung war nicht erreichbar.");
        return cached;
      }
      setSpecWarning(error instanceof Error ? error.message : "Die SPEDV-Struktur ist nicht erreichbar.");
      return null;
    } finally {
      setSpecLoading(false);
    }
  }

  async function connectWithKey(key: string, currentSpec: Record<string, unknown>, silent = false) {
    const parsedSpec = parseOpenApi(currentSpec);
    const probe = validationEndpoint(parsedSpec.endpoints);
    if (!probe) throw new Error("In der SPEDV-Beschreibung wurde kein Prüf-Endpunkt gefunden.");

    if (!silent) setConnecting(true);
    setConnectionError("");
    try {
      const result = await proxyCall(probe, key);
      if (!result.ok) throw new Error(resultError(result));
      await saveApiKey(key);
      setAuthConfig(OFFICIAL_AUTH);
      setApiKey(key);
      setConnected(true);
      setKeyInput("");
      automaticRefreshStarted.current = false;
    } catch (error) {
      setConnected(false);
      setApiKey("");
      if (!silent) setConnectionError(error instanceof Error ? error.message : "Verbindung fehlgeschlagen.");
    } finally {
      if (!silent) setConnecting(false);
    }
  }

  async function connect() {
    const key = keyInput.trim();
    if (!key) {
      setConnectionError("Trage deinen persönlichen SPEDV-Hauptschlüssel ein.");
      return;
    }
    if (!spec) {
      setConnectionError("Die SPEDV-Struktur ist noch nicht bereit.");
      return;
    }
    await connectWithKey(key, spec);
  }

  async function refreshEndpoints(list: ApiEndpoint[], all = false) {
    if (!apiKey || !list.length) return;
    const candidates = uniqueEndpoints(list.filter(canLoadAutomatically));
    if (!candidates.length) return;
    if (all) setRefreshingAll(true);
    setLoadingEndpointIds((current) => uniqueStrings([...current, ...candidates.map((endpoint) => endpoint.id)]));

    try {
      for (let index = 0; index < candidates.length; index += 4) {
        const chunk = candidates.slice(index, index + 4);
        await Promise.all(chunk.map(async (endpoint) => {
          try {
            const result = await proxyCall(endpoint, apiKey);
            setCachedResponse(endpoint, result);
          } catch (error) {
            const fallback: ApiCallResult = {
              ok: false,
              upstreamStatus: 0,
              statusText: "App Error",
              contentType: "application/json",
              headers: {},
              data: { error: error instanceof Error ? error.message : "Unbekannter Fehler" },
              elapsedMs: 0,
              timestamp: new Date().toISOString(),
            };
            setCachedResponse(endpoint, fallback);
          }
        }));
        setCachedResponses(getCachedResponses());
      }
    } finally {
      const completed = new Set(candidates.map((endpoint) => endpoint.id));
      setLoadingEndpointIds((current) => current.filter((id) => !completed.has(id)));
      if (all) setRefreshingAll(false);
    }
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

  async function disconnect() {
    await clearApiKey();
    setApiKey("");
    setConnected(false);
    setKeyInput("");
    setSelectedModule(null);
    setSelectedEndpoint(null);
    setTab("home");
    automaticRefreshStarted.current = false;
  }

  if (specLoading && !spec) return <LoadingScreen />;

  if (!connected) {
    return (
      <main className="app-shell setup">
        <section className="setup-card">
          <div className="setup-logo">SV</div>
          <div className="eyebrow">Einmal verbinden, direkt loslegen</div>
          <h1>Dein SPEDV.<br />Komplett auf dem Handy.</h1>
          <p className="lead">Trage einmal deinen persönlichen SPEDV-Hauptschlüssel ein. Danach lädt die App automatisch Profil, Spedition, Fahrer, Fuhrpark, Statistiken, Finanzen und alle weiteren verfügbaren Bereiche.</p>

          <div className="grid" style={{ gap: 12, marginTop: 22 }}>
            <label className="input-wrap">
              <span className="label">Persönlicher SPEDV-Hauptschlüssel</span>
              <div style={{ position: "relative" }}>
                <KeyRound size={17} style={{ position: "absolute", left: 14, top: 15, color: "var(--muted)" }} />
                <input
                  className="input"
                  style={{ paddingLeft: 43 }}
                  type="password"
                  autoComplete="off"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder="SPEDV-Key einfügen"
                  onKeyDown={(event) => event.key === "Enter" && void connect()}
                />
              </div>
            </label>
            <button className="button" disabled={connecting || !spec} onClick={() => void connect()}>
              {connecting ? <span className="spinner" /> : <Sparkles size={17} />}
              {connecting ? "SPEDV wird verbunden" : "App starten"}
            </button>
          </div>

          {connectionError && <div className="notice error" style={{ marginTop: 13 }}><AlertTriangle size={18} />{connectionError}</div>}
          {specWarning && <div className="notice error" style={{ marginTop: 13 }}><WifiOff size={18} />{specWarning}</div>}
          <div className="notice" style={{ marginTop: 18 }}><LockKeyhole size={18} />Der Schlüssel wird verschlüsselt auf diesem Gerät gespeichert. Es müssen keine API-Adressen oder einzelnen Schnittstellen eingetragen werden.</div>
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
          {online ? "Verbunden" : "Offline"}
        </div>
      </header>

      {tab === "home" && (
        <section className="page">
          <div className="hero">
            <div className="eyebrow">Dein SPEDV Dashboard</div>
            <h1>Alles da.<br />Ohne API-Gefummel.</h1>
            <p className="lead">Alle verfügbaren SPEDV-Bereiche werden automatisch erkannt, geladen und als fertige Ansichten dargestellt.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button className="button" onClick={() => setTab("areas")}><Blocks size={17} /> Alle Bereiche</button>
              <button className="button secondary" disabled={refreshingAll} onClick={() => void refreshEndpoints(automaticEndpoints, true)}>
                {refreshingAll ? <span className="spinner" /> : <RefreshCw size={17} />}
                {refreshingAll ? "Alles wird geladen" : "Alles aktualisieren"}
              </button>
            </div>
          </div>

          {!isStandalone && !installHintHidden && (
            <div className="notice section">
              <UploadCloud size={19} />
              <div style={{ flex: 1 }}><strong>Als iPhone-App installieren</strong><br />In Safari „Teilen“ und danach „Zum Home-Bildschirm“ wählen.</div>
              <button className="button ghost icon-button" onClick={() => setInstallHintHidden(true)}><X size={16} /></button>
            </div>
          )}

          {specWarning && <div className="notice error section"><WifiOff size={18} />{specWarning}</div>}

          <div className="grid stats">
            <StatCard icon={Blocks} value={modules.length} label="Fertige Bereiche" />
            <StatCard icon={Layers3} value={endpoints.length} label="SPEDV-Funktionen" />
            <StatCard icon={Activity} value={successfulCached} label="Erfolgreich geladen" />
            <StatCard icon={failedCached ? AlertTriangle : ShieldCheck} value={failedCached} label="Fehlerhafte Bereiche" />
          </div>

          <div className="section">
            <div className="section-head">
              <div><h2>Deine Bereiche</h2><div className="section-copy">Direkt öffnen, keine API-Auswahl notwendig</div></div>
              <button className="button ghost" onClick={() => setTab("areas")}>Alle ansehen <ChevronRight size={15} /></button>
            </div>
            <div className="grid three">
              {modules.slice(0, 9).map((module) => (
                <ModuleCard key={module.id} module={module} cachedResponses={cachedResponses} loadingEndpointIds={loadingEndpointIds} onOpen={() => setSelectedModule(module)} />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-head"><div><h2>Zuletzt aktualisiert</h2><div className="section-copy">Aktuelle Daten aus deinen SPEDV-Bereichen</div></div></div>
            {cachedList.length ? (
              <div className="endpoint-list">
                {cachedList.slice(0, 6).map((item) => {
                  const endpoint = endpoints.find((candidate) => candidate.id === item.endpointId);
                  const module = modules.find((candidate) => candidate.endpoints.some((candidateEndpoint) => candidateEndpoint.id === item.endpointId));
                  if (!endpoint || !module) return null;
                  const count = numberOfRecords(item.result.data);
                  return (
                    <button className="endpoint" key={item.endpointId} onClick={() => setSelectedModule(module)}>
                      <span className={`badge ${item.result.ok ? "good" : "bad"}`}>{item.result.upstreamStatus || "ERR"}</span>
                      <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{module.title}</span><span className="endpoint-path" style={{ display: "block" }}>{endpoint.summary} · {formatTime(item.result.timestamp)}{count !== null ? ` · ${count} Einträge` : ""}</span></span>
                      <ChevronRight size={17} color="var(--muted)" />
                    </button>
                  );
                })}
              </div>
            ) : <EmptyState icon={Activity} title={refreshingAll ? "SPEDV wird geladen" : "Noch keine Daten"} copy={refreshingAll ? "Die verfügbaren Bereiche werden automatisch abgefragt." : "Tippe auf „Alles aktualisieren“ beziehungsweise öffne einen Bereich."} />}
          </div>
        </section>
      )}

      {tab === "areas" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Alle Funktionen fertig sortiert</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>SPEDV Bereiche</h1><div className="section-copy">{modules.length} Bereiche aus {endpoints.length} verfügbaren Funktionen</div></div></div>
          <div className="search"><Search size={17} /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aufträge, Fahrer, Fahrzeuge, Finanzen …" /></div>
          <div className="grid two section">
            {filteredModules.map((module) => (
              <ModuleCard key={module.id} module={module} cachedResponses={cachedResponses} loadingEndpointIds={loadingEndpointIds} onOpen={() => setSelectedModule(module)} />
            ))}
          </div>
          {!filteredModules.length && <EmptyState icon={Search} title="Nichts gefunden" copy="Passe den Suchbegriff an." />}
        </section>
      )}

      {tab === "history" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Aktivität</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>Verlauf</h1><div className="section-copy">Manuell ausgeführte Detailaktionen</div></div></div>
          {historyState.length ? (
            <div className="endpoint-list">
              {historyState.map((item) => {
                const endpoint = endpoints.find((candidate) => candidate.id === item.endpointId);
                return (
                  <button className="endpoint" key={item.id} onClick={() => endpoint && setSelectedEndpoint(endpoint)} disabled={!endpoint}>
                    <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
                    <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{item.summary}</span><span className="endpoint-path" style={{ display: "block" }}>{formatTime(item.timestamp)} · {item.elapsedMs} ms</span></span>
                    <span className={`badge ${item.ok ? "good" : "bad"}`}>{item.status || "ERR"}</span>
                  </button>
                );
              })}
            </div>
          ) : <EmptyState icon={Clock3} title="Noch kein Verlauf" copy="Nur Detailaktionen mit Eingaben erscheinen hier. Die normalen Bereiche laden automatisch." />}
        </section>
      )}

      {tab === "settings" && (
        <section className="page">
          <div className="section-head"><div><div className="eyebrow">Konfiguration</div><h1 style={{ fontSize: 38, marginBottom: 5 }}>Einstellungen</h1><div className="section-copy">Verbindung, Sicherheit und Gerätespeicher</div></div></div>

          <div className="card pad">
            <div className="settings-row">
              <div><div className="settings-title">SPEDV-Verbindung</div><div className="settings-desc">Ein Hauptschlüssel · automatisch erkannte Anmeldung</div></div>
              <span className="badge good"><ShieldCheck size={13} /> Aktiv</span>
            </div>
            <div className="settings-row">
              <div><div className="settings-title">Alle Daten aktualisieren</div><div className="settings-desc">Lädt sämtliche direkt abrufbaren SPEDV-Bereiche neu.</div></div>
              <button className="button secondary" disabled={refreshingAll} onClick={() => void refreshEndpoints(automaticEndpoints, true)}>{refreshingAll ? <span className="spinner" /> : <RefreshCw size={17} />} Aktualisieren</button>
            </div>
            <div className="settings-row">
              <div><div className="settings-title">Schreibende Aktionen</div><div className="settings-desc">POST, PUT, PATCH und DELETE erlauben. Änderungen müssen weiterhin doppelt bestätigt werden.</div></div>
              <button className={`toggle ${writeAccess ? "on" : ""}`} aria-label="Schreibzugriff umschalten" onClick={() => { const next = !writeAccess; setWriteAccess(next); setWriteEnabled(next); }} />
            </div>
            <div className="settings-row">
              <div><div className="settings-title">App-Struktur</div><div className="settings-desc">{modules.length} Bereiche · {endpoints.length} Funktionen · {parsed?.version || "Version unbekannt"}</div></div>
              <button className="button secondary icon-button" disabled={specLoading} onClick={() => void loadSpec()}>{specLoading ? <span className="spinner" /> : <RefreshCw size={17} />}</button>
            </div>
          </div>

          <div className="card pad section">
            <h3>Lokaler Speicher</h3>
            <p className="section-copy">Geladene Antworten und Verlauf bleiben nur auf diesem Gerät.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 13 }}>
              <button className="button secondary" onClick={() => { clearLocalData(); setHistoryState([]); setCachedResponses({}); }}><Database size={16} /> Geladene Daten löschen</button>
              <button className="button danger" onClick={() => void disconnect()}><LogOut size={16} /> SPEDV-Key entfernen</button>
            </div>
          </div>

          <div className="notice section"><ShieldCheck size={18} />Es gibt keine manuelle API-Konfiguration mehr. Die App lädt die offizielle SPEDV-Struktur automatisch und verwendet ausschließlich deinen verschlüsselt gespeicherten Hauptschlüssel.</div>
        </section>
      )}

      <nav className="bottom-nav four-items" aria-label="Hauptnavigation">
        <NavItem icon={Home} label="Start" active={tab === "home"} onClick={() => setTab("home")} />
        <NavItem icon={ListFilter} label="Bereiche" active={tab === "areas"} onClick={() => setTab("areas")} />
        <NavItem icon={Clock3} label="Verlauf" active={tab === "history"} onClick={() => setTab("history")} />
        <NavItem icon={Settings} label="Einstellungen" active={tab === "settings"} onClick={() => setTab("settings")} />
      </nav>

      {selectedModule && (
        <ModuleSheet
          module={selectedModule}
          cachedResponses={cachedResponses}
          loadingEndpointIds={loadingEndpointIds}
          onRefresh={(module) => void refreshEndpoints(module.automaticEndpoints)}
          onOpenEndpoint={(endpoint) => { setSelectedModule(null); setSelectedEndpoint(endpoint); }}
          onClose={() => setSelectedModule(null)}
        />
      )}

      {selectedEndpoint && (
        <EndpointSheet
          key={selectedEndpoint.id}
          endpoint={selectedEndpoint}
          apiKey={apiKey}
          auth={OFFICIAL_AUTH}
          writeEnabled={writeAccess}
          cachedResult={cachedResponses[selectedEndpoint.id]?.result}
          onClose={() => setSelectedEndpoint(null)}
          onExecuted={onExecuted}
        />
      )}
    </main>
  );
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function ModuleCard({ module, cachedResponses, loadingEndpointIds, onOpen }: {
  module: ResolvedSpedvModule;
  cachedResponses: Record<string, CachedResponse>;
  loadingEndpointIds: string[];
  onOpen: () => void;
}) {
  const Icon = MODULE_ICONS[module.icon] || Wrench;
  const automaticIds = new Set(module.automaticEndpoints.map((endpoint) => endpoint.id));
  const cached = Object.values(cachedResponses).filter((item) => automaticIds.has(item.endpointId));
  const successful = cached.filter((item) => item.result.ok);
  const loading = module.automaticEndpoints.some((endpoint) => loadingEndpointIds.includes(endpoint.id));
  const records = successful.reduce((sum, item) => sum + (numberOfRecords(item.result.data) || 0), 0);

  return (
    <button className="card pad interactive module-card" style={{ textAlign: "left" }} onClick={onOpen}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="stat-icon"><Icon size={18} /></div>
        {loading ? <span className="spinner" /> : <span className={`badge ${cached.some((item) => !item.result.ok) ? "bad" : successful.length ? "good" : ""}`}>{successful.length}/{module.automaticEndpoints.length || module.endpoints.length} geladen</span>}
      </div>
      <h3 style={{ marginTop: 16 }}>{module.title}</h3>
      <div className="section-copy">{records > 0 ? `${records} Einträge verfügbar` : module.description}</div>
      <div className="module-meta">{module.endpoints.length} Funktionen <ChevronRight size={14} /></div>
    </button>
  );
}

function LoadingScreen() {
  return (
    <main className="app-shell setup">
      <section className="setup-card">
        <div className="setup-logo">SV</div>
        <div className="eyebrow">Initialisierung</div>
        <h1>SPEDV Mobile</h1>
        <p className="lead">Die vollständige SPEDV-Struktur wird automatisch vorbereitet.</p>
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

function EmptyState({ icon: Icon, title, copy }: { icon: typeof Gauge; title: string; copy: string }) {
  return <div className="card empty"><div className="empty-icon"><Icon size={23} /></div><h3>{title}</h3><div className="section-copy">{copy}</div></div>;
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{label}</span></button>;
}
