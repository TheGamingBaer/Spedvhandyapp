import { NextResponse } from 'next/server';

const candidates = [
  'https://api.sped-v.de/swagger/v1/swagger.json',
  'https://api.sped-v.de/swagger.json',
  'https://api.sped-v.de/openapi.json'
];

export async function GET() {
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
      }
    } catch {}
  }
  return NextResponse.json({ error: 'SPEDV OpenAPI-Dokument konnte nicht geladen werden.' }, { status: 502 });
}
