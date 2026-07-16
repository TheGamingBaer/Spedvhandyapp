"use client";

import { AlertTriangle, ChevronRight, Clock3, Database, RefreshCw, X } from "lucide-react";
import { useEffect, useRef } from "react";
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

function freshness(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { label: "Zeit unbekannt", stale: true };

  const ageMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return { label: "Gerade aktualisiert", stale: false };
  if (minutes < 60) return { label: `Vor ${minutes} Min.`, stale: false };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `Vor ${hours} Std.`, stale: hours >= 6 };

  return {
    label: date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    stale: true,
  };
}

export function ModuleSheet({ module, cachedResponses, loadingEndpointIds, onRefresh, onOpenEndpoint, onClose }: Props) {
  const automatic = module.automaticEndpoints;
  const additional = module.endpoints.filter((endpoint) => !automatic.some((candidate) => candidate.id === endpoint.id));
  const isLoading = automatic.some((endpoint) => loadingEndpointIds.includes(endpoint.id));
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={sheetRef} className="sheet module-sheet" role="dialog" aria-modal="true" aria-labelledby="module-sheet-title" aria-describedby="module-sheet-description">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">SPEDV Mobile</div>
            <h2 id="module-sheet-title" style={{ marginTop: 7 }}>{module.title}</h2>
            <div id="module-sheet-description" className="section-copy">{module.description}</div>
          </div>
          <button ref={closeButtonRef} className="button secondary icon-button" onClick={onClose} aria-label={`${module.title} schließen`}><X size={18} /></button>
        </div>

        <button className="button secondary section" style={{ width: "100%" }} onClick={() => onRefresh(module)} disabled={isLoading || !automatic.length} aria-busy={isLoading}>
          {isLoading ? <span className="spinner" /> : <RefreshCw size={17} />}
          {isLoading ? "Daten werden aktualisiert" : automatic.length ? "Bereich aktualisieren" : "Keine automatische Aktualisierung"}
        </button>

        <div className="section module-results" aria-live="polite" aria-busy={isLoading}>
          {automatic.length ? automatic.map((endpoint) => {
            const cached = cachedResponses[endpoint.id];
            const loading = loadingEndpointIds.includes(endpoint.id);
            const age = cached ? freshness(cached.result.timestamp) : null;
            return (
              <article className="module-result" key={endpoint.id}>
                <div className="module-result-head">
                  <div><h3>{friendlyAction(endpoint)}</h3><span>{module.title}</span></div>
                  {loading ? <span className="spinner" aria-label="Wird aktualisiert" /> : cached ? <span className={`badge ${cached.result.ok && !age?.stale ? "good" : "bad"}`}>{cached.result.ok ? age?.stale ? "Veraltet" : "Aktuell" : "Fehler"}</span> : null}
                </div>

                {cached && age && (
                  <div className="section-copy" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <Clock3 size={14} aria-hidden="true" />
                    <span>{age.label}{loading ? " · neue Daten werden geladen" : ""}</span>
                  </div>
                )}

                {loading && !cached && <div className="smart-loading" aria-label="Daten werden geladen"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
                {!loading && !cached && <div className="notice"><Database size={17} />Noch keine Daten geladen.</div>}
                {cached?.result.ok && <SmartDataView data={cached.result.data} context={friendlyAction(endpoint)} title={`spedv-${module.id}-${endpoint.operationId || endpoint.method}`} />}
                {cached && !cached.result.ok && <div className="notice error" role="alert"><AlertTriangle size={17} />{errorMessage(cached.result.data)}</div>}
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
