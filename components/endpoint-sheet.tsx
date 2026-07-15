"use client";

import { AlertTriangle, Check, ChevronRight, Copy, Download, FileUp, Play, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createExample } from "@/lib/openapi";
import type { ApiCallResult, ApiEndpoint, AuthConfig } from "@/lib/types";
import { DataView } from "@/components/data-view";

interface Props {
  endpoint: ApiEndpoint;
  apiKey: string;
  auth: AuthConfig;
  writeEnabled: boolean;
  cachedResult?: ApiCallResult;
  onClose: () => void;
  onExecuted: (endpoint: ApiEndpoint, result: ApiCallResult) => void;
}

type FieldMap = Record<string, string>;
type FileMap = Record<string, File | null>;

function initialParameterValues(endpoint: ApiEndpoint) {
  return Object.fromEntries(endpoint.parameters.map((parameter) => [parameter.name, String(parameter.example ?? parameter.default ?? "")]));
}

function schemaProperties(endpoint: ApiEndpoint) {
  return (endpoint.requestBody?.schema?.properties || {}) as Record<string, Record<string, unknown>>;
}

async function toBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function EndpointSheet({ endpoint, apiKey, auth, writeEnabled, cachedResult, onClose, onExecuted }: Props) {
  const [parameterValues, setParameterValues] = useState<FieldMap>(() => initialParameterValues(endpoint));
  const bodyExample = useMemo(() => createExample(endpoint.requestBody?.schema), [endpoint]);
  const [bodyText, setBodyText] = useState(() => bodyExample === undefined ? "" : JSON.stringify(bodyExample, null, 2));
  const [formValues, setFormValues] = useState<FieldMap>({});
  const [files, setFiles] = useState<FileMap>({});
  const [result, setResult] = useState<ApiCallResult | undefined>(cachedResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const isWrite = !endpoint.isSafeRead;
  const isMultipart = endpoint.requestBody?.contentTypes.some((type) => type.includes("multipart/form-data")) || endpoint.parameters.some((parameter) => parameter.in === "formData");
  const properties = schemaProperties(endpoint);

  async function execute() {
    if (isWrite && !writeEnabled) {
      setError("Schreibende API-Aktionen sind in den Einstellungen deaktiviert.");
      return;
    }
    if (isWrite && !confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError("");
    try {
      let path = endpoint.path;
      const query: Record<string, string> = {};
      const headers: Record<string, string> = {};
      for (const parameter of endpoint.parameters) {
        const value = parameterValues[parameter.name]?.trim();
        if (parameter.required && !value && ["path", "query", "header"].includes(parameter.in)) {
          throw new Error(`Pflichtfeld „${parameter.name}“ fehlt.`);
        }
        if (!value) continue;
        if (parameter.in === "path") path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
        if (parameter.in === "query") query[parameter.name] = value;
        if (parameter.in === "header") headers[parameter.name] = value;
      }

      const envelope: Record<string, unknown> = {
        path,
        method: endpoint.method.toUpperCase(),
        query,
        headers,
        auth: { ...auth, key: apiKey },
      };

      if (isMultipart) {
        const multipartFiles = [];
        for (const [name, file] of Object.entries(files)) {
          if (file) multipartFiles.push({ name, filename: file.name, type: file.type, dataBase64: await toBase64(file) });
        }
        envelope.multipart = {
          fields: {
            ...Object.fromEntries(endpoint.parameters.filter((parameter) => parameter.in === "formData" && parameter.type !== "file").map((parameter) => [parameter.name, parameterValues[parameter.name] || ""])),
            ...formValues,
          },
          files: multipartFiles,
        };
      } else if (endpoint.requestBody || endpoint.parameters.some((parameter) => parameter.in === "body")) {
        if (bodyText.trim()) {
          try { envelope.body = JSON.parse(bodyText); }
          catch { throw new Error("Der Request-Body enthält ungültiges JSON."); }
        }
        envelope.contentType = endpoint.requestBody?.contentTypes[0] || "application/json";
      }

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const nextResult = await response.json() as ApiCallResult;
      setResult(nextResult);
      onExecuted(endpoint, nextResult);
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der API-Aufruf ist fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  function downloadBinary() {
    if (!result?.binary) return;
    const bytes = Uint8Array.from(atob(result.binary.base64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.binary.filename || "spedv-download";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const visibleParams = endpoint.parameters.filter((parameter) => ["path", "query", "header", "formData"].includes(parameter.in));

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 9 }}>
              <span className={`method ${endpoint.method}`}>{endpoint.method.toUpperCase()}</span>
              <span className="badge">{endpoint.tag}</span>
              {endpoint.deprecated && <span className="badge bad">Veraltet</span>}
            </div>
            <h2>{endpoint.summary}</h2>
            <div className="endpoint-path" style={{ fontSize: 11 }}>{endpoint.path}</div>
          </div>
          <button className="button secondary icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>

        {endpoint.description && <p className="lead" style={{ marginTop: 14 }}>{endpoint.description}</p>}

        {visibleParams.length > 0 && (
          <div className="section">
            <h3>Parameter</h3>
            <div className="grid two" style={{ marginTop: 10 }}>
              {visibleParams.map((parameter) => {
                const property = properties[parameter.name];
                const isFile = parameter.type === "file" || property?.format === "binary";
                return (
                  <label className="input-wrap" key={`${parameter.in}:${parameter.name}`}>
                    <span className="label">{parameter.name}{parameter.required ? " *" : ""} · {parameter.in}</span>
                    {isFile ? (
                      <input className="input" type="file" onChange={(event) => setFiles((current) => ({ ...current, [parameter.name]: event.target.files?.[0] || null }))} />
                    ) : (
                      <input className="input" value={parameterValues[parameter.name] || ""} placeholder={parameter.description || parameter.type || "Wert"} onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {isMultipart && Object.keys(properties).length > 0 && (
          <div className="section">
            <h3>Formulardaten</h3>
            <div className="grid two" style={{ marginTop: 10 }}>
              {Object.entries(properties).map(([name, property]) => {
                const isFile = property.format === "binary" || property.type === "string" && property.format === "byte";
                return (
                  <label className="input-wrap" key={name}>
                    <span className="label">{name}</span>
                    {isFile ? (
                      <input className="input" type="file" onChange={(event) => setFiles((current) => ({ ...current, [name]: event.target.files?.[0] || null }))} />
                    ) : (
                      <input className="input" value={formValues[name] || ""} onChange={(event) => setFormValues((current) => ({ ...current, [name]: event.target.value }))} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {!isMultipart && (endpoint.requestBody || endpoint.parameters.some((parameter) => parameter.in === "body")) && (
          <div className="section">
            <div className="section-head">
              <div><h3>Request-Body</h3><div className="section-copy">{endpoint.requestBody?.contentTypes.join(", ") || "application/json"}</div></div>
              <button className="button ghost" onClick={async () => {
                await navigator.clipboard.writeText(bodyText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopiert" : "Kopieren"}</button>
            </div>
            <textarea className="textarea" value={bodyText} onChange={(event) => setBodyText(event.target.value)} spellCheck={false} />
          </div>
        )}

        {isWrite && !writeEnabled && (
          <div className="notice error section"><ShieldAlert size={18} /> Diese Aktion verändert Daten. Aktiviere schreibende API-Aufrufe zuerst in den Einstellungen.</div>
        )}
        {confirming && (
          <div className="notice error section"><AlertTriangle size={18} /><div><strong>Änderung bestätigen</strong><br />Tippe erneut auf „Jetzt wirklich ausführen“.</div></div>
        )}
        {error && <div className="notice error section"><AlertTriangle size={18} />{error}</div>}

        <div className="section" style={{ display: "flex", gap: 10 }}>
          <button className="button" style={{ flex: 1 }} disabled={loading || (isWrite && !writeEnabled)} onClick={execute}>
            {loading ? <span className="spinner" /> : isMultipart ? <FileUp size={17} /> : <Play size={17} />}
            {loading ? "Wird ausgeführt" : confirming ? "Jetzt wirklich ausführen" : "API-Aufruf ausführen"}
          </button>
          {result?.binary && <button className="button secondary icon-button" onClick={downloadBinary}><Download size={18} /></button>}
        </div>

        {result && (
          <div className="section">
            <div className="section-head">
              <div><h3>Antwort</h3><div className="section-copy">{new Date(result.timestamp).toLocaleString("de-DE")}</div></div>
              <div style={{ display: "flex", gap: 7 }}>
                <span className={`badge ${result.ok ? "good" : "bad"}`}>{result.upstreamStatus || "ERR"} {result.statusText}</span>
                <span className="badge">{result.elapsedMs} ms</span>
              </div>
            </div>
            <DataView data={result.data} title={`spedv-${endpoint.tag}-${endpoint.operationId || endpoint.method}`} />
          </div>
        )}

        <button className="button ghost" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>Schließen <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
