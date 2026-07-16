"use client";

import { AlertTriangle, Check, ChevronRight, Copy, Download, FileUp, Play, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createExample } from "@/lib/openapi";
import type { ApiCallResult, ApiEndpoint, ApiParameter, AuthConfig } from "@/lib/types";
import { SmartDataView } from "@/components/smart-data-view";

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
type Schema = Record<string, unknown>;

interface BodyField {
  path: string;
  label: string;
  schema: Schema;
  required: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  userid: "Benutzer-ID",
  accountid: "Konto-ID",
  speditionid: "Speditions-ID",
  vehicleid: "Fahrzeug-ID",
  truckid: "LKW-ID",
  trailerid: "Trailer-ID",
  driverid: "Fahrer-ID",
  orderid: "Auftrags-ID",
  taskid: "Auftrags-ID",
  tourid: "Tour-ID",
  branchid: "Niederlassungs-ID",
  ids: "IDs",
  iban: "IBAN",
  username: "Benutzername",
  name: "Name",
  comment: "Kommentar",
  description: "Beschreibung",
  start: "Beginn",
  end: "Ende",
  startdate: "Beginn",
  enddate: "Ende",
  date: "Datum",
  includedpartnerships: "Partnerschaften einbeziehen",
  includepartnerships: "Partnerschaften einbeziehen",
  includekontorpartnerships: "Kontor-Partnerschaften einbeziehen",
  includetruckpartnerships: "Truck-Partnerschaften einbeziehen",
  refresh: "Neu laden",
  file: "Datei",
  image: "Bild",
  document: "Dokument",
  amount: "Betrag",
  price: "Preis",
  active: "Aktiv",
  state: "Status",
  status: "Status",
  game: "Spiel",
};

function normalizeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function friendlyLabel(value: string) {
  const normalized = normalizeKey(value);
  if (FIELD_LABELS[normalized]) return FIELD_LABELS[normalized];
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function friendlyAction(endpoint: ApiEndpoint) {
  const summary = endpoint.summary
    .replace(/^get\s+/i, "")
    .replace(/^post\s+/i, "")
    .replace(/^put\s+/i, "")
    .replace(/^patch\s+/i, "")
    .replace(/^delete\s+/i, "")
    .replace(/\bendpoint\b/gi, "")
    .trim();
  if (summary) return summary;
  return endpoint.tag;
}

function initialParameterValues(endpoint: ApiEndpoint) {
  return Object.fromEntries(endpoint.parameters.map((parameter) => [parameter.name, String(parameter.example ?? parameter.default ?? "")]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flattenBodyFields(schema: Schema | undefined, prefix = "", depth = 0, inheritedRequired = false): BodyField[] {
  if (!schema || depth > 2) return [];
  const properties = isRecord(schema.properties) ? schema.properties as Record<string, Schema> : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : []);
  const fields: BodyField[] = [];

  for (const [name, child] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    const childRequired = inheritedRequired || required.has(name);
    const type = String(child.type || "");
    if ((type === "object" || child.properties) && depth < 2) {
      fields.push(...flattenBodyFields(child, path, depth + 1, childRequired));
      continue;
    }
    if (type === "array" || child.items || child.allOf || child.oneOf || child.anyOf) continue;
    fields.push({ path, label: friendlyLabel(name), schema: child, required: childRequired });
  }
  return fields;
}

function getAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isRecord(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

function initialBodyValues(example: unknown, fields: BodyField[]) {
  return Object.fromEntries(fields.map((field) => [field.path, String(getAtPath(example, field.path) ?? "")]));
}

function parseFieldValue(raw: string, schema: Schema) {
  const type = String(schema.type || "string");
  if (type === "boolean") return raw === "true";
  if (type === "integer") return raw === "" ? 0 : Number.parseInt(raw, 10);
  if (type === "number") return raw === "" ? 0 : Number(raw);
  return raw;
}

function buildBody(example: unknown, fields: BodyField[], values: FieldMap) {
  const target: Record<string, unknown> = isRecord(example) ? structuredClone(example) : {};
  for (const field of fields) setAtPath(target, field.path, parseFieldValue(values[field.path] || "", field.schema));
  return target;
}

function inputType(parameter: Pick<ApiParameter, "type" | "format"> | BodyField["schema"]) {
  const type = "type" in parameter ? String(parameter.type || "") : "";
  const format = "format" in parameter ? String(parameter.format || "") : "";
  if (format === "date") return "date";
  if (format === "date-time") return "datetime-local";
  if (format === "email") return "email";
  if (type === "integer" || type === "number") return "number";
  return "text";
}

function fieldHint(parameter: ApiParameter) {
  if (parameter.description) return parameter.description;
  if (parameter.in === "path") return "Nummer oder Kennung des gewünschten Eintrags";
  if (parameter.type === "array") return "Mehrere Werte mit Komma trennen";
  return parameter.required ? "Pflichtangabe" : "Optional";
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
  const bodyExample = useMemo(() => endpoint.requestBody?.example ?? createExample(endpoint.requestBody?.schema), [endpoint]);
  const bodyFields = useMemo(() => flattenBodyFields(endpoint.requestBody?.schema), [endpoint]);
  const [bodyValues, setBodyValues] = useState<FieldMap>(() => initialBodyValues(bodyExample, bodyFields));
  const [bodyText, setBodyText] = useState(() => bodyExample === undefined ? "" : JSON.stringify(bodyExample, null, 2));
  const [advancedBody, setAdvancedBody] = useState(false);
  const [formValues, setFormValues] = useState<FieldMap>({});
  const [files, setFiles] = useState<FileMap>({});
  const [result, setResult] = useState<ApiCallResult | undefined>(cachedResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const isWrite = !endpoint.isSafeRead;
  const isMultipart = endpoint.requestBody?.contentTypes.some((type) => type.includes("multipart/form-data")) || endpoint.parameters.some((parameter) => parameter.in === "formData");
  const bodyProperties = isRecord(endpoint.requestBody?.schema?.properties) ? endpoint.requestBody?.schema?.properties as Record<string, Schema> : {};
  const visibleParams = endpoint.parameters.filter((parameter) => ["path", "query", "header", "formData"].includes(parameter.in));

  async function execute() {
    if (isWrite && !writeEnabled) {
      setError("Änderungen sind in den Einstellungen noch deaktiviert.");
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
          throw new Error(`„${friendlyLabel(parameter.name)}“ muss ausgefüllt werden.`);
        }
        if (!value) continue;
        if (parameter.in === "path") path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
        if (parameter.in === "query") query[parameter.name] = value;
        if (parameter.in === "header") headers[parameter.name] = value;
      }

      for (const field of bodyFields) {
        if (field.required && !bodyValues[field.path]?.trim() && !advancedBody) throw new Error(`„${field.label}“ muss ausgefüllt werden.`);
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
        if (advancedBody || !bodyFields.length) {
          if (bodyText.trim()) {
            try { envelope.body = JSON.parse(bodyText); }
            catch { throw new Error("Die erweiterten Daten enthalten ungültiges JSON."); }
          }
        } else {
          envelope.body = buildBody(bodyExample, bodyFields, bodyValues);
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
      if (!nextResult.ok) setError(typeof nextResult.data === "string" ? nextResult.data : `SPEDV meldet Status ${nextResult.upstreamStatus || "ERR"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Aktion ist fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  function downloadBinary() {
    if (!result?.binary) return;
    const bytes = Uint8Array.from(atob(result.binary.base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.binary.filename || "spedv-download";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const actionTitle = friendlyAction(endpoint);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet action-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 9 }}>
              <span className={`badge ${isWrite ? "bad" : "good"}`}>{isWrite ? "Änderung" : "Abfrage"}</span>
              <span className="badge">{endpoint.tag}</span>
              {endpoint.deprecated && <span className="badge bad">Veraltet</span>}
            </div>
            <h2>{actionTitle}</h2>
            <div className="section-copy">{isWrite ? "Daten in SPEDV ändern" : "Aktuelle Daten aus SPEDV laden"}</div>
          </div>
          <button className="button secondary icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>

        {endpoint.description && <p className="lead" style={{ marginTop: 14 }}>{endpoint.description}</p>}

        {visibleParams.length > 0 && (
          <div className="section form-section">
            <h3>Benötigte Angaben</h3>
            <div className="grid two" style={{ marginTop: 10 }}>
              {visibleParams.map((parameter) => {
                const property = bodyProperties[parameter.name];
                const isFile = parameter.type === "file" || property?.format === "binary";
                const isBoolean = parameter.type === "boolean";
                const values = Array.isArray(parameter.schema?.enum) ? parameter.schema?.enum : null;
                return (
                  <label className="input-wrap" key={`${parameter.in}:${parameter.name}`}>
                    <span className="label">{friendlyLabel(parameter.name)}{parameter.required ? " *" : ""}</span>
                    {isFile ? (
                      <input className="input" type="file" onChange={(event) => setFiles((current) => ({ ...current, [parameter.name]: event.target.files?.[0] || null }))} />
                    ) : values ? (
                      <select className="select" value={parameterValues[parameter.name] || ""} onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))}>
                        <option value="">Bitte auswählen</option>
                        {values.map((value) => <option value={String(value)} key={String(value)}>{String(value)}</option>)}
                      </select>
                    ) : isBoolean ? (
                      <select className="select" value={parameterValues[parameter.name] || ""} onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))}>
                        <option value="">Standard</option><option value="true">Ja</option><option value="false">Nein</option>
                      </select>
                    ) : (
                      <input className="input" type={inputType(parameter)} value={parameterValues[parameter.name] || ""} placeholder={fieldHint(parameter)} onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.name]: event.target.value }))} />
                    )}
                    <small className="field-hint">{fieldHint(parameter)}</small>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {!isMultipart && bodyFields.length > 0 && (
          <div className="section form-section">
            <div className="section-head"><div><h3>Angaben</h3><div className="section-copy">Fülle nur die benötigten Felder aus</div></div></div>
            <div className="grid two">
              {bodyFields.map((field) => {
                const enumValues = Array.isArray(field.schema.enum) ? field.schema.enum : null;
                const isBoolean = field.schema.type === "boolean";
                return (
                  <label className="input-wrap" key={field.path}>
                    <span className="label">{field.label}{field.required ? " *" : ""}</span>
                    {enumValues ? (
                      <select className="select" value={bodyValues[field.path] || ""} onChange={(event) => setBodyValues((current) => ({ ...current, [field.path]: event.target.value }))}>
                        <option value="">Bitte auswählen</option>
                        {enumValues.map((value) => <option value={String(value)} key={String(value)}>{String(value)}</option>)}
                      </select>
                    ) : isBoolean ? (
                      <select className="select" value={bodyValues[field.path] || "false"} onChange={(event) => setBodyValues((current) => ({ ...current, [field.path]: event.target.value }))}>
                        <option value="true">Ja</option><option value="false">Nein</option>
                      </select>
                    ) : (
                      <input className="input" type={inputType(field.schema)} value={bodyValues[field.path] || ""} onChange={(event) => setBodyValues((current) => ({ ...current, [field.path]: event.target.value }))} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {isMultipart && Object.keys(bodyProperties).length > 0 && (
          <div className="section form-section">
            <h3>Dateien und Angaben</h3>
            <div className="grid two" style={{ marginTop: 10 }}>
              {Object.entries(bodyProperties).map(([name, property]) => {
                const isFile = property.format === "binary" || property.type === "string" && property.format === "byte";
                return (
                  <label className="input-wrap" key={name}>
                    <span className="label">{friendlyLabel(name)}</span>
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
          <details className="technical-details section" open={!bodyFields.length} onToggle={(event) => setAdvancedBody((event.currentTarget as HTMLDetailsElement).open)}>
            <summary>Erweiterte Eingabe</summary>
            <div className="section-head" style={{ marginTop: 12 }}>
              <div><h3>Technischer Dateninhalt</h3><div className="section-copy">Nur nötig, wenn die normalen Felder nicht ausreichen</div></div>
              <button className="button ghost" onClick={async () => {
                await navigator.clipboard.writeText(bodyText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopiert" : "Kopieren"}</button>
            </div>
            <textarea className="textarea" value={bodyText} onChange={(event) => setBodyText(event.target.value)} spellCheck={false} />
          </details>
        )}

        {isWrite && !writeEnabled && (
          <div className="notice error section"><ShieldAlert size={18} /> Diese Aktion verändert SPEDV-Daten. Aktiviere Änderungen zuerst in den Einstellungen.</div>
        )}
        {confirming && (
          <div className="notice error section"><AlertTriangle size={18} /><div><strong>Änderung wirklich speichern?</strong><br />Prüfe alle Angaben und tippe erneut auf den roten Button.</div></div>
        )}
        {error && <div className="notice error section"><AlertTriangle size={18} />{error}</div>}

        <div className="section" style={{ display: "flex", gap: 10 }}>
          <button className={`button ${isWrite ? "danger" : ""}`} style={{ flex: 1 }} disabled={loading || (isWrite && !writeEnabled)} onClick={execute}>
            {loading ? <span className="spinner" /> : isMultipart ? <FileUp size={17} /> : <Play size={17} />}
            {loading ? "Wird verarbeitet" : confirming ? "Änderung jetzt speichern" : isWrite ? "Änderung prüfen" : "Daten anzeigen"}
          </button>
          {result?.binary && <button className="button secondary icon-button" onClick={downloadBinary}><Download size={18} /></button>}
        </div>

        {result?.ok && (
          <div className="section action-result">
            <div className="section-head"><div><h3>Ergebnis</h3><div className="section-copy">Aktualisiert {new Date(result.timestamp).toLocaleString("de-DE")}</div></div><span className="badge good">Erfolgreich</span></div>
            <SmartDataView data={result.data} context={actionTitle} title={`spedv-${endpoint.tag}-${endpoint.operationId || endpoint.method}`} />
          </div>
        )}

        <details className="technical-details section">
          <summary>Technische Informationen</summary>
          <div className="smart-info-grid" style={{ marginTop: 12 }}>
            <div className="smart-info"><span>Methode</span><strong>{endpoint.method.toUpperCase()}</strong></div>
            <div className="smart-info"><span>Pfad</span><strong>{endpoint.path}</strong></div>
            {result && <div className="smart-info"><span>Antwortzeit</span><strong>{result.elapsedMs} ms</strong></div>}
            {result && <div className="smart-info"><span>Status</span><strong>{result.upstreamStatus || "ERR"}</strong></div>}
          </div>
        </details>

        <button className="button ghost" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>Schließen <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
