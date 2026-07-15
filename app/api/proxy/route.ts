import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BASE = process.env.SPEDV_API_BASE_URL || "https://api.sped-v.de";
const ALLOWED_HOSTS = new Set(["api.sped-v.de"]);

const authSchema = z.object({
  key: z.string().min(1).max(4096),
  mode: z.enum(["header", "query", "bearer"]),
  name: z.string().min(1).max(128),
  prefix: z.string().max(64).optional(),
});

const fileSchema = z.object({
  name: z.string().min(1).max(256),
  filename: z.string().min(1).max(512),
  type: z.string().max(256).optional(),
  dataBase64: z.string().min(1),
});

const requestSchema = z.object({
  path: z.string().min(1).max(2048),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  contentType: z.string().max(256).optional(),
  auth: authSchema.optional(),
  multipart: z.object({
    fields: z.record(z.string(), z.string()).default({}),
    files: z.array(fileSchema).default([]),
  }).optional(),
});

function safeFilename(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match?.[1] ? decodeURIComponent(match[1].replace(/"/g, "")) : undefined;
}

async function handler(request: NextRequest) {
  const started = performance.now();
  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: "Ungültiger API-Aufruf.", details: error instanceof Error ? error.message : undefined }, { status: 400 });
  }

  if (!payload.path.startsWith("/") || payload.path.includes("://") || payload.path.includes("\\")) {
    return NextResponse.json({ error: "Ungültiger API-Pfad." }, { status: 400 });
  }

  const target = new URL(payload.path, DEFAULT_BASE);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Zielhost ist nicht erlaubt." }, { status: 400 });
  }

  for (const [key, raw] of Object.entries(payload.query || {})) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) target.searchParams.append(key, String(value));
  }

  const headers = new Headers({ Accept: "application/json, text/plain, */*" });
  for (const [key, value] of Object.entries(payload.headers || {})) {
    const normalized = key.toLowerCase();
    if (["host", "cookie", "origin", "referer", "content-length"].includes(normalized)) continue;
    headers.set(key, value);
  }

  if (payload.auth) {
    if (payload.auth.mode === "query") {
      target.searchParams.set(payload.auth.name, payload.auth.key);
    } else if (payload.auth.mode === "bearer") {
      headers.set("Authorization", `${payload.auth.prefix || "Bearer"} ${payload.auth.key}`.trim());
    } else {
      headers.set(payload.auth.name, payload.auth.prefix ? `${payload.auth.prefix} ${payload.auth.key}` : payload.auth.key);
    }
  }

  let body: BodyInit | undefined;
  if (payload.multipart) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload.multipart.fields)) form.append(key, value);
    for (const file of payload.multipart.files) {
      const bytes = Uint8Array.from(Buffer.from(file.dataBase64, "base64"));
      form.append(file.name, new Blob([bytes], { type: file.type || "application/octet-stream" }), file.filename);
    }
    body = form;
  } else if (payload.body !== undefined && !["GET", "HEAD"].includes(payload.method)) {
    const contentType = payload.contentType || "application/json";
    headers.set("Content-Type", contentType);
    if (contentType.includes("json")) body = JSON.stringify(payload.body);
    else if (typeof payload.body === "string") body = payload.body;
    else body = new URLSearchParams(payload.body as Record<string, string>);
  }

  try {
    const upstream = await fetch(target, {
      method: payload.method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const responseHeaders: Record<string, string> = {};
    for (const key of ["content-type", "content-disposition", "etag", "last-modified", "location", "x-total-count"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders[key] = value;
    }

    let data: unknown = null;
    let binary: { base64: string; filename?: string } | undefined;
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      const text = await upstream.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    } else if (contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("html")) {
      data = await upstream.text();
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      binary = {
        base64: buffer.toString("base64"),
        filename: safeFilename(upstream.headers.get("content-disposition")),
      };
      data = { size: buffer.byteLength, filename: binary.filename, contentType };
    }

    return NextResponse.json({
      ok: upstream.ok,
      upstreamStatus: upstream.status,
      statusText: upstream.statusText,
      contentType,
      headers: responseHeaders,
      data,
      binary,
      elapsedMs: Math.round(performance.now() - started),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      upstreamStatus: 0,
      statusText: "Proxy Error",
      contentType: "application/json",
      headers: {},
      data: { error: error instanceof Error ? error.message : "Unbekannter Fehler" },
      elapsedMs: Math.round(performance.now() - started),
      timestamp: new Date().toISOString(),
    }, { status: 502 });
  }
}

export const POST = handler;
