import { NextRequest, NextResponse } from "next/server";
import bundledSpec from "@/docs/spedv-openapi.json";

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

function prepareSpec(input: Record<string, any>) {
  const spec = structuredClone(input);
  const probePath = "/v1/auth/claims/apikey";
  const probe = spec.paths?.[probePath];
  if (probe?.get) {
    probe.get.summary = "SPEDV-Verbindung prüfen";
    probe.get.description = "Prüft den persönlichen SPEDV-Hauptschlüssel.";
    spec.paths = { [probePath]: probe, ...spec.paths };
  }
  return spec;
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
        headers: { Accept: "application/json, */*;q=0.5" },
        signal: AbortSignal.timeout(12_000),
      });
      attempts.push({ url: url.toString(), status: response.status });
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = prepareSpec(JSON.parse(text));
      if (!parsed?.paths) continue;
      return NextResponse.json(parsed, {
        headers: {
          "Cache-Control": "no-store",
          "X-SPEDV-Spec-Source": "live",
          "X-SPEDV-Spec-URL": url.toString(),
        },
      });
    } catch (error) {
      attempts.push({ url: url.toString(), error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  }

  const fallback = prepareSpec(bundledSpec as Record<string, any>);
  return NextResponse.json(fallback, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-SPEDV-Spec-Source": "bundled",
      "X-SPEDV-Live-Attempts": String(attempts.length),
    },
  });
}
