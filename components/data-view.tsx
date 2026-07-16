"use client";

import { Download, Braces, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|client[-_]?key|access[-_]?key|refresh[-_]?key|private[-_]?key|session)/i;
const REDACTED = "[aus Sicherheitsgründen ausgeblendet]";

function sanitizeData(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[zu tief verschachtelt]";
  if (Array.isArray(value)) return value.map((item) => sanitizeData(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeData(entry, depth + 1);
  }
  return output;
}

function normalizePrimitive(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectColumns(rows: Record<string, unknown>[]) {
  const frequency = new Map<string, number>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row)) frequency.set(key, (frequency.get(key) || 0) + 1);
  }
  return [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key]) => key);
}

function objectRows(value: unknown): Record<string, unknown>[] | null {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))
    ? value as Record<string, unknown>[]
    : null;
}

function extractRows(data: unknown): Record<string, unknown>[] | null {
  const direct = objectRows(data);
  if (direct) return direct;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  for (const key of ["items", "data", "results", "records", "entries", "value", "content"]) {
    const rows = objectRows(record[key]);
    if (rows) return rows;
  }
  return null;
}

function safeFilename(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 80) || "spedv-data";
}

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  let normalized = normalizePrimitive(value);
  if (/^[=+\-@]/.test(normalized.trimStart())) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
}

export function DataView({ data, title = "spedv-data" }: { data: unknown; title?: string }) {
  const safeData = useMemo(() => sanitizeData(data), [data]);
  const rows = useMemo(() => extractRows(safeData), [safeData]);
  const columns = useMemo(() => rows ? collectColumns(rows) : [], [rows]);
  const [mode, setMode] = useState<"table" | "json">("table");
  const visibleMode = rows ? mode : "json";
  const filename = safeFilename(title);

  return (
    <div className="response">
      <div className="response-head">
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {rows && (
            <button type="button" className={`chip ${visibleMode === "table" ? "active" : ""}`} aria-pressed={visibleMode === "table"} onClick={() => setMode("table")}>
              <Table2 size={13} /> Tabelle
            </button>
          )}
          <button type="button" className={`chip ${visibleMode === "json" ? "active" : ""}`} aria-pressed={visibleMode === "json"} onClick={() => setMode("json")}>
            <Braces size={13} /> JSON
          </button>
          {rows && <span className="badge">{rows.length} Einträge</span>}
        </div>
        <button type="button" className="button ghost icon-button" aria-label="Bereinigte Daten exportieren" title="Export ohne Schlüssel und Tokens" onClick={() => {
          if (visibleMode === "table" && rows) download(`${filename}.csv`, toCsv(rows, columns), "text/csv;charset=utf-8");
          else download(`${filename}.json`, JSON.stringify(safeData, null, 2), "application/json");
        }}><Download size={17} /></button>
      </div>
      <div className="response-body">
        {visibleMode === "table" && rows ? (
          <div className="table-wrap">
            <table>
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 250).map((row, index) => (
                  <tr key={index}>{columns.map((column) => <td key={column} title={normalizePrimitive(row[column])}>{normalizePrimitive(row[column])}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {rows.length > 250 && <div className="empty">Anzeige auf 250 Einträge begrenzt. Der bereinigte Export enthält alle Daten.</div>}
          </div>
        ) : <pre>{JSON.stringify(safeData, null, 2)}</pre>}
      </div>
    </div>
  );
}
