import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.sped-v.de';
const allowed = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);

async function handler(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (!allowed.has(method)) return NextResponse.json({ error: 'Methode nicht erlaubt.' }, { status: 405 });

  const path = request.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith('/')) return NextResponse.json({ error: 'Ungültiger API-Pfad.' }, { status: 400 });

  const target = new URL(path, BASE);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key !== 'path') target.searchParams.append(key, value);
  }

  const apiKey = request.headers.get('x-spedv-api-key');
  if (!apiKey) return NextResponse.json({ error: 'API-Key fehlt.' }, { status: 401 });

  const headers = new Headers();
  headers.set('Accept', request.headers.get('accept') || 'application/json');
  headers.set('Authorization', apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`);
  headers.set('X-API-Key', apiKey.replace(/^Bearer\s+/i, ''));
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  const init: RequestInit = { method, headers, cache: 'no-store' };
  if (!['GET','HEAD'].includes(method)) init.body = await request.arrayBuffer();

  try {
    const upstream = await fetch(target, init);
    const body = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
    const disposition = upstream.headers.get('content-disposition');
    if (upstreamType) responseHeaders.set('Content-Type', upstreamType);
    if (disposition) responseHeaders.set('Content-Disposition', disposition);
    responseHeaders.set('Cache-Control', 'no-store');
    return new NextResponse(body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: 'SPEDV API ist nicht erreichbar.' }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
