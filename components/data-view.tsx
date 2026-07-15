"use client";

import { Download, Braces, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

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

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const escape = (value: unknown) => `"${normalizePrimitive(value).replace(/"/g, '""')}"`;
  return [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}

export function DataView({ data, title = "spedv-data" }: { data: unknown; title?: string }) {
  const rows = useMemo(() => Array.isArray(data) && data.every((item) => item && typeof item === "object" && !Array.isArray(item)) ? data as Record<string, unknown>[] : null, [data]);
  const columns = useMemo(() => rows ? collectColumns(rows) : [], [rows]);
  const [mode, setMode] = useState<"table" | "json">(rows ? "table" : "json");

  return (
    <div className="response">
      <div className="response-head">
        <div style={{ display: "flex", gap: 7 }}>
          {rows && (
            <button className={`chip ${mode === "table" ? "active" : ""}`} onClick={() => setMode("table")}>
              <Table2 size={13} /> Tabelle
            </button>
          )}
          <button className={`chip ${mode === "json" ? "active" : ""}`} onClick={() => setMode("json")}>
            <Braces size={13} /> JSON
          </button>
        </div>
        <button className="button ghost icon-button" aria-label="Daten exportieren" onClick={() => {
          if (mode === "table" && rows) download(`${title}.csv`, toCsv(rows, columns), "text/csv;charset=utf-8");
          else download(`${title}.json`, JSON.stringify(data, null, 2), "application/json");
        }}><Download size={17} /></button>
      </div>
      <div className="response-body">
        {mode === "table" && rows ? (
          <div className="table-wrap">
            <table>
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 250).map((row, index) => (
                  <tr key={index}>{columns.map((column) => <td key={column} title={normalizePrimitive(row[column])}>{normalizePrimitive(row[column])}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {rows.length > 250 && <div className="empty">Anzeige auf 250 Einträge begrenzt. Der Export enthält alle Daten.</div>}
          </div>
        ) : <pre>{JSON.stringify(data, null, 2)}</pre>}
      </div>
    </div>
  );
}
