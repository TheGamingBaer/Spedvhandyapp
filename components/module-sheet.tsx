"use client";

import { AlertTriangle, ChevronRight, Database, RefreshCw, X } from "lucide-react";
import { SmartDataView } from "@/components/smart-data-view";
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

function friendlyAction(endpoint: ApiEndpoint) {
  const summary = endpoint.summary
    .replace(/^get\s+/i, "")
    .replace(/^post\s+/i, "")
    .replace(/^put\s+/i, "")
    .replace(/^delete\s+/i, "")
    .replace(/\bendpoint\b/gi, "")
    .trim();
  if (summary && !/^GET |^POST |^PUT |^PATCH |^DELETE /i.test(summary)) return summary;
  const segment = endpoint.path.split("/").filter(Boolean).at(-1)?.replace(/[{}]/g, "") || "Details";
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function actionHint(endpoint: ApiEndpoint) {
  const required = endpoint.parameters.filter((parameter) => parameter.required).length;
  if (!endpoint.isSafeRead) return "Daten ändern · Bestätigung erforderlich";
  if (required > 0) return `${required} Angabe${required === 1 ? "" : "n"} erforderlich`;
  return "Detailansicht öffnen";
}

export function ModuleSheet({ module, cachedResponses, loadingEndpointIds, onRefresh, onOpenEndpoint, onClose }: Props) {
  const automatic = module.automaticEndpoints;
  const additional = module.endpoints.filter((endpoint) => !automatic.some((candidate) => candidate.id === endpoint.id));
  const isLoading = automatic.some((endpoint) => loadingEndpointIds.includes(endpoint.id));

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet module-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">SPEDV Mobile</div>
            <h2 style={{ marginTop: 7 }}>{module.title}</h2>
            <div className="section-copy">{module.description}</div>
          </div>
          <button className="button secondary icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>

        <button className="button secondary section" style={{ width: "100%" }} onClick={() => onRefresh(module)} disabled={isLoading || !automatic.length}>
          {isLoading ? <span className="spinner" /> : <RefreshCw size={17} />}
          {isLoading ? "Daten werden aktualisiert" : automatic.length ? "Bereich aktualisieren" : "Keine automatische Aktualisierung"}
        </button>

        <div className="section module-results">
          {automatic.length ? automatic.map((endpoint) => {
            const cached = cachedResponses[endpoint.id];
            const loading = loadingEndpointIds.includes(endpoint.id);
            return (
              <article className="module-result" key={endpoint.id}>
                <div className="module-result-head">
                  <div><h3>{friendlyAction(endpoint)}</h3><span>{module.title}</span></div>
                  {loading ? <span className="spinner" /> : cached ? <span className={`badge ${cached.result.ok ? "good" : "bad"}`}>{cached.result.ok ? "Aktuell" : "Fehler"}</span> : null}
                </div>

                {loading && !cached && <div className="smart-loading"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
                {!loading && !cached && <div className="notice"><Database size={17} />Noch keine Daten geladen.</div>}
                {cached?.result.ok && <SmartDataView data={cached.result.data} context={friendlyAction(endpoint)} title={`spedv-${module.id}-${endpoint.operationId || endpoint.method}`} />}
                {cached && !cached.result.ok && <div className="notice error"><AlertTriangle size={17} />{errorMessage(cached.result.data)}</div>}
              </article>
            );
          }) : (
            <div className="notice"><Database size={17} />Dieser Bereich benötigt zuerst eine Auswahl, Nummer oder andere Angabe. Die passenden Aktionen stehen direkt darunter.</div>
          )}
        </div>

        {additional.length > 0 && (
          <div className="section">
            <div className="section-head"><div><h3>Weitere Aktionen</h3><div className="section-copy">Nur öffnen, auswählen und die benötigten Angaben eintragen</div></div></div>
            <div className="mobile-action-list">
              {additional.map((endpoint) => (
                <button className="mobile-action" key={endpoint.id} onClick={() => onOpenEndpoint(endpoint)}>
                  <div className={`mobile-action-icon ${endpoint.isSafeRead ? "read" : "write"}`}><Database size={17} /></div>
                  <span><strong>{friendlyAction(endpoint)}</strong><small>{actionHint(endpoint)}</small></span>
                  <ChevronRight size={18} color="var(--muted)" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
