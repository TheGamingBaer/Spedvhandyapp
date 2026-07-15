"use client";

import { AlertTriangle, ChevronRight, Database, RefreshCw, X } from "lucide-react";
import { DataView } from "@/components/data-view";
import type { ApiEndpoint, CachedResponse } from "@/lib/types";
import type { ResolvedSpedvModule } from "@/lib/spedv-modules";

interface Props {
  module: ResolvedSpedvModule;
  cachedResponses: Record<string, CachedResponse>;
  loadingEndpointIds: string[];
  onRefresh: (module: ResolvedSpedvModule) => void;
  onOpenEndpoint: (endpoint: ApiEndpoint) => void;
  onClose: () => void;
}

function errorMessage(data: unknown) {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message", "detail", "title"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "SPEDV hat für diesen Bereich keine Daten geliefert.";
}

export function ModuleSheet({ module, cachedResponses, loadingEndpointIds, onRefresh, onOpenEndpoint, onClose }: Props) {
  const automatic = module.automaticEndpoints;
  const additional = module.endpoints.filter((endpoint) => !automatic.some((candidate) => candidate.id === endpoint.id));

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">SPEDV Bereich</div>
            <h2 style={{ marginTop: 7 }}>{module.title}</h2>
            <div className="section-copy">{module.description}</div>
          </div>
          <button className="button secondary icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>

        <button className="button secondary section" style={{ width: "100%" }} onClick={() => onRefresh(module)} disabled={automatic.some((endpoint) => loadingEndpointIds.includes(endpoint.id))}>
          <RefreshCw size={17} /> Bereich aktualisieren
        </button>

        <div className="section module-results">
          {automatic.length ? automatic.map((endpoint) => {
            const cached = cachedResponses[endpoint.id];
            const loading = loadingEndpointIds.includes(endpoint.id);
            return (
              <article className="card pad" key={endpoint.id}>
                <div className="section-head" style={{ alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <h3>{endpoint.summary}</h3>
                    <div className="endpoint-path">{endpoint.path}</div>
                  </div>
                  {loading ? <span className="spinner" /> : cached ? <span className={`badge ${cached.result.ok ? "good" : "bad"}`}>{cached.result.upstreamStatus || "ERR"}</span> : null}
                </div>

                {loading && !cached && <div className="skeleton" style={{ height: 90, marginTop: 12 }} />}
                {!loading && !cached && <div className="notice"><Database size={17} />Noch nicht geladen. Tippe auf „Bereich aktualisieren“.</div>}
                {cached?.result.ok && <DataView data={cached.result.data} title={`spedv-${module.id}-${endpoint.operationId || endpoint.method}`} />}
                {cached && !cached.result.ok && <div className="notice error"><AlertTriangle size={17} />{errorMessage(cached.result.data)}</div>}
              </article>
            );
          }) : (
            <div className="notice"><Database size={17} />Dieser Bereich benötigt zuerst eine Auswahl oder ID. Die passenden Funktionen stehen direkt darunter.</div>
          )}
        </div>

        {additional.length > 0 && (
          <div className="section">
            <div className="section-head"><div><h3>Weitere Funktionen</h3><div className="section-copy">Formulare und Detailansichten mit notwendigen Angaben</div></div></div>
            <div className="endpoint-list">
              {additional.map((endpoint) => (
                <button className="endpoint" key={endpoint.id} onClick={() => onOpenEndpoint(endpoint)}>
                  <span className={`method ${endpoint.method}`}>{endpoint.method.toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}><span className="endpoint-title" style={{ display: "block" }}>{endpoint.summary}</span><span className="endpoint-path" style={{ display: "block" }}>{endpoint.path}</span></span>
                  <ChevronRight size={17} color="var(--muted)" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
