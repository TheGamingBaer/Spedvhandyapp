import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BASE = process.env.SPEDV_API_BASE_URL || "https://api.sped-v.de";
const ALLOWED_HOSTS = new Set(["api.sped-v.de"]);
const AUTH_REJECTION_STATUSES = new Set([401, 403]);

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

type Payload = z.infer<typeof requestSchema>;
type JsonRecord = Record<string, unknown>;

type AuthAttempt = {
  id: string;
  label: string;
  apply: (url: URL, headers: Headers) => void;
};

function safeFilename(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match?.[1] ? decodeURIComponent(match[1].replace(/"/g, "")) : undefined;
}

function createBaseTarget(payload: Payload) {
  const target = new URL(payload.path, DEFAULT_BASE);
  for (const [key, raw] of Object.entries(payload.query || {})) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) target.searchParams.append(key, String(value));
  }
  return target;
}

function createBaseHeaders(payload: Payload) {
  const headers = new Headers({ Accept: "application/json, text/plain, */*" });
  for (const [key, value] of Object.entries(payload.headers || {})) {
    const normalized = key.toLowerCase();
    if (["host", "cookie", "origin", "referer", "content-length"].includes(normalized)) continue;
    headers.set(key, value);
  }
  return headers;
}

function createBody(payload: Payload, headers: Headers): BodyInit | undefined {
  if (payload.multipart) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload.multipart.fields)) form.append(key, value);
    for (const file of payload.multipart.files) {
      const bytes = Uint8Array.from(Buffer.from(file.dataBase64, "base64"));
      form.append(file.name, new Blob([bytes], { type: file.type || "application/octet-stream" }), file.filename);
    }
    return form;
  }

  if (payload.body === undefined || ["GET", "HEAD"].includes(payload.method)) return undefined;

  const contentType = payload.contentType || "application/json";
  headers.set("Content-Type", contentType);
  if (contentType.includes("json")) return JSON.stringify(payload.body);
  if (typeof payload.body === "string") return payload.body;
  return new URLSearchParams(payload.body as Record<string, string>);
}

function extractToken(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.split(".").length === 3 || trimmed.length > 40) return trimmed;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = extractToken(item, depth + 1);
      if (token) return token;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;

  const record = value as JsonRecord;
  for (const key of ["accessToken", "access_token", "jwt", "jwtToken", "token", "bearerToken", "idToken"]) {
    const token = extractToken(record[key], depth + 1);
    if (token) return token;
  }
  for (const nested of Object.values(record)) {
    const token = extractToken(nested, depth + 1);
    if (token) return token;
  }
  return undefined;
}

async function exchangeClientKey(key: string): Promise<string | undefined> {
  const target = new URL("/v1/auth/clientkey", DEFAULT_BASE);
  target.searchParams.set("key", key);

  const response = await fetch(target, {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    return undefined;
  }

  const text = await response.text();
  if (!text) return undefined;
  try {
    return extractToken(JSON.parse(text));
  } catch {
    return extractToken(text);
  }
}

function buildDirectAuthAttempts(payload: Payload): AuthAttempt[] {
  if (!payload.auth?.key) {
    return [{ id: "none", label: "Keine Authentifizierung", apply: () => undefined }];
  }

  const key = payload.auth.key.trim();
  const attempts: AuthAttempt[] = [
    {
      id: "official-api-key",
      label: "SPEDV X-Api-Key",
      apply: (_url, headers) => headers.set("X-Api-Key", key),
    },
  ];

  if (payload.auth.mode === "bearer") {
    attempts.push({
      id: "openapi-bearer",
      label: "OpenAPI Authorization",
      apply: (_url, headers) => headers.set("Authorization", `${payload.auth?.prefix || "Bearer"} ${key}`.trim()),
    });
  } else if (payload.auth.mode === "query") {
    attempts.push({
      id: `openapi-query:${payload.auth.name.toLowerCase()}`,
      label: `OpenAPI Query ${payload.auth.name}`,
      apply: (url) => url.searchParams.set(payload.auth!.name, key),
    });
  } else if (payload.auth.name.toLowerCase() !== "x-api-key") {
    attempts.push({
      id: `openapi-header:${payload.auth.name.toLowerCase()}`,
      label: `OpenAPI Header ${payload.auth.name}`,
      apply: (_url, headers) => headers.set(payload.auth!.name, payload.auth?.prefix ? `${payload.auth.prefix} ${key}` : key),
    });
  }

  attempts.push({
    id: "legacy-bearer",
    label: "Authorization: Bearer",
    apply: (_url, headers) => headers.set("Authorization", `Bearer ${key}`),
  });

  return attempts.filter((attempt, index) => attempts.findIndex((other) => other.id === attempt.id) === index);
}

async function executeRequest(payload: Payload, target: URL, headers: Headers) {
  return fetch(target, {
    method: payload.method,
    headers,
    body: createBody(payload, headers),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
}

async function fetchWithAuthFallback(payload: Payload, targetTemplate: URL, headersTemplate: Headers) {
  const attempts = buildDirectAuthAttempts(payload);
  let upstream: Response | undefined;
  let authUsed = attempts[0]?.label || "Keine Authentifizierung";

  for (const attempt of attempts) {
    const target = new URL(targetTemplate);
    const headers = new Headers(headersTemplate);
    attempt.apply(target, headers);

    const response = await executeRequest(payload, target, headers);
    upstream = response;
    authUsed = attempt.label;

    if (!AUTH_REJECTION_STATUSES.has(response.status)) return { upstream, authUsed };
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  const rawKey = payload.auth?.key.trim();
  const isClientKeyEndpoint = targetTemplate.pathname === "/v1/auth/clientkey";
  if (rawKey && !isClientKeyEndpoint) {
    const token = await exchangeClientKey(rawKey);
    if (token) {
      const target = new URL(targetTemplate);
      const headers = new Headers(headersTemplate);
      headers.set("Authorization", `Bearer ${token}`);
      upstream = await executeRequest(payload, target, headers);
      authUsed = "SPEDV Client-Key → Bearer JWT";
      return { upstream, authUsed };
    }
  }

  if (!upstream) throw new Error("SPEDV hat keine Antwort geliefert.");
  return { upstream, authUsed };
}

async function handler(request: NextRequest) {
  const started = performance.now();
  let payload: Payload;
  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: "Ungültiger API-Aufruf.", details: error instanceof Error ? error.message : undefined }, { status: 400 });
  }

  if (!payload.path.startsWith("/") || payload.path.includes("://") || payload.path.includes("\\")) {
    return NextResponse.json({ error: "Ungültiger API-Pfad." }, { status: 400 });
  }

  const target = createBaseTarget(payload);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Zielhost ist nicht erlaubt." }, { status: 400 });
  }

  try {
    const { upstream, authUsed } = await fetchWithAuthFallback(payload, target, createBaseHeaders(payload));
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
      authUsed,
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
