'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronRight, Database, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Star, X } from 'lucide-react';

type Endpoint = { method: string; path: string; summary: string; tag: string; parameters?: any[]; requestBody?: any };

const methods = ['get','post','put','patch','delete','head','options'];

function parseSpec(spec: any): Endpoint[] {
  const list: Endpoint[] = [];
  for (const [path, item] of Object.entries<any>(spec?.paths || {})) {
    for (const method of methods) {
      const op = item?.[method];
      if (!op) continue;
      list.push({
        method: method.toUpperCase(),
        path,
        summary: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        tag: op.tags?.[0] || 'Allgemein',
        parameters: [...(item.parameters || []), ...(op.parameters || [])],
        requestBody: op.requestBody
      });
    }
  }
  return list.sort((a,b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path));
}

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [spec, setSpec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [params, setParams] = useState<Record<string,string>>({});
  const [body, setBody] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const key = localStorage.getItem('spedv_api_key') || '';
    setApiKey(key); setSaved(Boolean(key));
    setFavorites(JSON.parse(localStorage.getItem('spedv_favorites') || '[]'));
    loadSpec();
  }, []);

  async function loadSpec() {
    setLoading(true);
    try { setSpec(await (await fetch('/api/openapi', { cache: 'no-store' })).json()); }
    finally { setLoading(false); }
  }

  function saveKey() {
    localStorage.setItem('spedv_api_key', apiKey.trim());
    setSaved(Boolean(apiKey.trim()));
  }

  const endpoints = useMemo(() => parseSpec(spec), [spec]);
  const filtered = endpoints.filter(e => `${e.method} ${e.path} ${e.summary} ${e.tag}`.toLowerCase().includes(query.toLowerCase()));
  const groups = useMemo(() => Object.entries(filtered.reduce<Record<string,Endpoint[]>>((acc,e) => ((acc[e.tag] ||= []).push(e), acc), {})), [filtered]);

  function toggleFavorite(e: Endpoint) {
    const id = `${e.method}:${e.path}`;
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(next); localStorage.setItem('spedv_favorites', JSON.stringify(next));
  }

  async function runEndpoint() {
    if (!selected || !apiKey.trim()) return;
    setRunning(true); setResult(null);
    try {
      let path = selected.path;
      const search = new URLSearchParams();
      for (const p of selected.parameters || []) {
        const value = params[p.name];
        if (!value) continue;
        if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(value));
        if (p.in === 'query') search.append(p.name, value);
      }
      const url = `/api/proxy?path=${encodeURIComponent(path)}${search.toString() ? `&${search}` : ''}`;
      const init: RequestInit = { method: selected.method, headers: { 'x-spedv-api-key': apiKey.trim(), 'Content-Type': 'application/json', Accept: 'application/json' } };
      if (!['GET','HEAD'].includes(selected.method)) init.body = body;
      const response = await fetch(url, init);
      const type = response.headers.get('content-type') || '';
      const data = type.includes('json') ? await response.json() : await response.text();
      setResult({ status: response.status, ok: response.ok, data });
    } catch (error: any) { setResult({ status: 0, ok: false, data: error?.message || 'Unbekannter Fehler' }); }
    finally { setRunning(false); }
  }

  return <main>
    <div className="orb orb-a"/><div className="orb orb-b"/>
    <header className="topbar">
      <div><span className="eyebrow">PRIVATE CONTROL CENTER</span><h1>SPEDV <b>Mobile</b></h1></div>
      <button className="iconButton" onClick={loadSpec} aria-label="Aktualisieren"><RefreshCw size={18}/></button>
    </header>

    <section className="hero glass">
      <div className="heroIcon"><Activity/></div>
      <div><span className="status"><i/> API Console</span><h2>Deine komplette Spedition.<br/>Direkt auf dem iPhone.</h2><p>Alle dokumentierten SPEDV-Endpunkte werden automatisch erkannt, gruppiert und ausführbar gemacht.</p></div>
    </section>

    <section className="stats">
      <article className="glass"><Database/><strong>{endpoints.length}</strong><span>Endpunkte</span></article>
      <article className="glass"><ShieldCheck/><strong>{saved ? 'Aktiv' : 'Offen'}</strong><span>API-Zugang</span></article>
      <article className="glass"><Star/><strong>{favorites.length}</strong><span>Favoriten</span></article>
    </section>

    <section className="glass keyCard">
      <div className="sectionTitle"><KeyRound size={18}/><div><strong>SPEDV API-Key</strong><span>Einmal eingeben, lokal auf diesem Gerät speichern</span></div></div>
      <div className="keyRow"><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="API-Key einfügen"/><button onClick={saveKey}>{saved ? 'Gespeichert' : 'Speichern'}</button></div>
      <small>Der Schlüssel wird nicht ins GitHub-Repository geschrieben.</small>
    </section>

    <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Endpunkt, Bereich oder Funktion suchen…"/></div>

    {loading ? <div className="loading"><Loader2 className="spin"/> SPEDV-Schnittstelle wird geladen…</div> :
      <section className="catalog">
        {groups.map(([tag, items]) => <div className="group" key={tag}>
          <div className="groupHead"><h3>{tag}</h3><span>{items.length}</span></div>
          <div className="endpointList">{items.map(e => {
            const id = `${e.method}:${e.path}`;
            return <button className="endpoint" key={id} onClick={()=>{setSelected(e);setParams({});setBody('{}');setResult(null)}}>
              <span className={`method ${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="endpointText"><strong>{e.summary}</strong><small>{e.path}</small></span>
              {favorites.includes(id) && <Star size={14} fill="currentColor"/>}<ChevronRight size={18}/>
            </button>})}</div>
        </div>)}
      </section>}

    {selected && <div className="sheetBackdrop" onClick={()=>setSelected(null)}><section className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheetHandle"/><div className="sheetTop"><span className={`method ${selected.method.toLowerCase()}`}>{selected.method}</span><button onClick={()=>setSelected(null)}><X/></button></div>
      <h2>{selected.summary}</h2><code>{selected.path}</code>
      <button className="favorite" onClick={()=>toggleFavorite(selected)}><Star size={17} fill={favorites.includes(`${selected.method}:${selected.path}`) ? 'currentColor' : 'none'}/> Favorit</button>
      {(selected.parameters || []).length > 0 && <div className="fields"><h4>Parameter</h4>{selected.parameters?.map((p:any)=><label key={`${p.in}-${p.name}`}><span>{p.name} <small>{p.in}{p.required ? ' · Pflicht' : ''}</small></span><input value={params[p.name] || ''} onChange={e=>setParams({...params,[p.name]:e.target.value})}/></label>)}</div>}
      {!['GET','HEAD'].includes(selected.method) && <label className="bodyField"><span>JSON-Body</span><textarea rows={8} value={body} onChange={e=>setBody(e.target.value)}/></label>}
      <button className="run" disabled={running || !saved} onClick={runEndpoint}>{running ? <><Loader2 className="spin"/> Wird ausgeführt…</> : 'Anfrage ausführen'}</button>
      {result && <div className={`result ${result.ok ? 'success' : 'error'}`}><div><strong>HTTP {result.status}</strong><span>{result.ok ? 'Erfolgreich' : 'Fehler'}</span></div><pre>{typeof result.data === 'string' ? result.data : JSON.stringify(result.data,null,2)}</pre></div>}
    </section></div>}
  </main>;
}
