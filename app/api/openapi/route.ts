import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BASE = process.env.SPEDV_API_BASE_URL || "https://api.sped-v.de";
const ALLOWED_HOSTS = new Set(["api.sped-v.de"]);
const CANDIDATES = [
  "/swagger/v1/swagger.json",
  "/swagger/swagger.json",
  "/swagger/openapi.json",
  "/openapi.json",
  "/swagger.json",
];

function isAllowed(url: URL) {
  return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
}

export async function GET(request: NextRequest) {
  const custom = request.nextUrl.searchParams.get("url");
  const urls: URL[] = [];

  if (custom) {
    try {
      const parsed = new URL(custom);
      if (!isAllowed(parsed)) return NextResponse.json({ error: "Nur die offizielle SPEDV-API ist erlaubt." }, { status: 400 });
      urls.push(parsed);
    } catch {
      return NextResponse.json({ error: "Ungültige OpenAPI-URL." }, { status: 400 });
    }
  } else {
    for (const path of CANDIDATES) urls.push(new URL(path, DEFAULT_BASE));
  }

  const attempts: Array<{ url: string; status?: number; error?: string }> = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json, application/yaml, text/yaml;q=0.9, */*;q=0.5" },
        signal: AbortSignal.timeout(12_000),
      });
      attempts.push({ url: url.toString(), status: response.status });
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (!parsed?.paths) continue;
      return NextResponse.json(parsed, {
        headers: {
          "Cache-Control": "no-store",
          "X-SPEDV-Spec-URL": url.toString(),
        },
      });
    } catch (error) {
      attempts.push({ url: url.toString(), error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  }

  return NextResponse.json(
    {
      error: "Die SPEDV-OpenAPI-Beschreibung konnte nicht automatisch geladen werden.",
      attempts,
    },
    { status: 502 },
  );
}
