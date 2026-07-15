"use client";

import {
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  Route,
  ShieldAlert,
  Truck,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { DataView } from "@/components/data-view";

type RecordValue = Record<string, unknown>;

interface Props {
  data: unknown;
  title?: string;
  context?: string;
}

interface RouteInfo {
  start?: string;
  startCompany?: string;
  destination?: string;
  destinationCompany?: string;
  distance?: number;
  currentDistance?: number;
}

const LABELS: Record<string, string> = {
  id: "ID",
  name: "Name",
  username: "Benutzername",
  displayname: "Anzeigename",
  firstname: "Vorname",
  lastname: "Nachname",
  email: "E-Mail",
  role: "Rolle",
  rolename: "Rolle",
  spedvteamrolename: "SPEDV-Teamrolle",
  tmpstaffrolename: "Teamrolle",
  state: "Status",
  status: "Status",
  active: "Aktiv",
  online: "Online",
  showasoffline: "Offline-Anzeige",
  hasspedvplus: "SPEDV Plus",
  company: "Unternehmen",
  companyname: "Unternehmen",
  spedition: "Spedition",
  speditionname: "Spedition",
  branch: "Niederlassung",
  city: "Stadt",
  country: "Land",
  street: "Straße",
  postalcode: "Postleitzahl",
  iban: "IBAN",
  bic: "BIC",
  balance: "Kontostand",
  amount: "Betrag",
  price: "Preis",
  income: "Einnahmen",
  expense: "Ausgaben",
  revenue: "Umsatz",
  start: "Start",
  startcity: "Startort",
  startcompany: "Startfirma",
  dest: "Ziel",
  destination: "Ziel",
  destcity: "Zielort",
  destcompany: "Zielfirma",
  distance: "Entfernung",
  totaldistance: "Gesamtstrecke",
  currentdistance: "Gefahren",
  odometer: "Kilometerstand",
  freight: "Fracht",
  weight: "Gewicht",
  game: "Spiel",
  mpserver: "Server",
  nearby: "In der Nähe",
  velocity: "Geschwindigkeit",
  speed: "Geschwindigkeit",
  speedlimit: "Tempolimit",
  cruisecontrol: "Tempomat",
  maxfuel: "Tankvolumen",
  actfuel: "Tankinhalt",
  fuel: "Kraftstoff",
  damagetruck: "LKW-Schaden",
  damagetrailer: "Trailer-Schaden",
  damagefreight: "Frachtschaden",
  truckmanufactor: "Hersteller",
  truckmanufacturer: "Hersteller",
  truckmodel: "Modell",
  truckplate: "Kennzeichen",
  estarrival: "Voraussichtliche Ankunft",
  arrival: "Ankunft",
  date: "Datum",
  createdat: "Erstellt",
  updatedat: "Aktualisiert",
  startdate: "Beginn",
  enddate: "Ende",
  expires: "Gültig bis",
  comment: "Kommentar",
  description: "Beschreibung",
  title: "Titel",
  count: "Anzahl",
  total: "Gesamt",
  place: "Platz",
  rank: "Rang",
  steamid: "Steam-ID",
  line: "Linie",
  delay: "Verspätung",
  next: "Nächster Halt",
  map: "Karte",
  server: "Server",
  trainnumber: "Zugnummer",
  trainvelocity: "Geschwindigkeit",
  trainnextstop: "Nächster Halt",
  traindestination: "Ziel",
  dispatchstation: "Stellwerk",
  artist: "Interpret",
  album: "Album",
};

const TITLE_KEYS = [
  "displayName",
  "displayname",
  "name",
  "username",
  "userName",
  "companyName",
  "speditionName",
  "title",
  "truckName",
  "vehicleName",
  "task_Freight",
  "freight",
  "iban",
  "plate",
  "truckPlate",
];
const STATUS_KEYS = ["status", "state", "online", "active", "showAsOffline", "checkState", "maintenanceState"];
const IMAGE_PATTERNS = [/avatar/i, /profile.*pic/i, /steam.*pic/i, /logo/i, /coverurl/i, /image/i, /picture/i];
const HIDDEN_PATTERNS = [/token/i, /refresh/i, /password/i, /secret/i, /^xcoord$/i, /^zcoord$/i, /latitude/i, /longitude/i];

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function stripPrefix(key: string) {
  return key.replace(/^(scS|task|omsI|stW|spotify|simRail|sped)[_-]?/i, "");
}

function normalizeKey(key: string) {
  return stripPrefix(key).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function friendlyLabel(key: string) {
  const normalized = normalizeKey(key);
  if (LABELS[normalized]) return LABELS[normalized];
  return stripPrefix(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function looksLikeDate(key: string, value: string) {
  return /(date|time|arrival|expires|created|updated|refresh|restart|begin|end)/i.test(key)
    && !Number.isNaN(Date.parse(value));
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);
}

function formatValue(key: string, value: unknown): string {
  if (isEmpty(value)) return "—";
  const normalized = normalizeKey(key);

  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") {
    if (/(eur|euro|balance|amount|price|cost|income|expense|revenue|saldo|umsatz)/i.test(normalized)) {
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
    }
    if (/(velocity|speed)/i.test(normalized)) return `${formatNumber(value)} km/h`;
    if (/(distance|odometer|kilometer|km)/i.test(normalized)) return `${formatNumber(value)} km`;
    if (/(weight|gewicht)/i.test(normalized)) return `${formatNumber(value)} kg`;
    if (/(damage|percent|percentage|progress)/i.test(normalized)) {
      const percentage = value >= 0 && value <= 1 ? value * 100 : value;
      return `${formatNumber(percentage)} %`;
    }
    if (/fuel/i.test(normalized)) return `${formatNumber(value)} l`;
    if (/(place|rank)/i.test(normalized)) return `#${formatNumber(value, 0)}`;
    return formatNumber(value);
  }
  if (typeof value === "string") {
    if (looksLikeDate(key, value)) {
      return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    }
    return value;
  }
  if (Array.isArray(value)) return `${value.length} Einträge`;
  if (isRecord(value)) return primaryTitle(value) || `${Object.keys(value).length} Angaben`;
  return String(value);
}

function valueByNormalizedKey(record: RecordValue, key: string) {
  const found = Object.keys(record).find((candidate) => normalizeKey(candidate) === normalizeKey(key));
  return found ? record[found] : undefined;
}

function firstText(record: RecordValue, keys: string[]) {
  for (const key of keys) {
    const value = valueByNormalizedKey(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isRecord(value)) {
      const nested = primaryTitle(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function primaryTitle(record: RecordValue, fallback = "") {
  const direct = firstText(record, TITLE_KEYS);
  if (direct) return direct;
  for (const key of ["user", "spedition", "company", "vehicle", "truck", "driver", "account"]) {
    const value = valueByNormalizedKey(record, key);
    if (isRecord(value)) {
      const nested = primaryTitle(value);
      if (nested) return nested;
    }
  }
  const idEntry = Object.entries(record).find(([key, value]) => /(^|_)id$/i.test(key) && !isEmpty(value));
  return idEntry ? `${friendlyLabel(idEntry[0])} ${formatValue(idEntry[0], idEntry[1])}` : fallback;
}

function imageUrl(record: RecordValue): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value) && IMAGE_PATTERNS.some((pattern) => pattern.test(key))) return value;
  }
  for (const value of Object.values(record)) {
    if (isRecord(value)) {
      const nested = imageUrl(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function statusValue(record: RecordValue) {
  for (const key of STATUS_KEYS) {
    const value = valueByNormalizedKey(record, key);
    if (isEmpty(value)) continue;
    if (normalizeKey(key) === "showasoffline" && typeof value === "boolean") return value ? "Offline" : "Online";
    if (typeof value === "boolean") return value ? "Aktiv" : "Inaktiv";
    return formatValue(key, value);
  }
  return undefined;
}

function statusTone(status?: string) {
  if (!status) return "";
  if (/online|active|aktiv|approved|finished|success|ok|indrive|fahrt/i.test(status)) return "good";
  if (/offline|inactive|inaktiv|rejected|error|failed|missing|damage|abgelehnt/i.test(status)) return "bad";
  return "";
}

function findText(record: RecordValue, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || !value.trim() || looksLikeDate(key, value)) continue;
    if (patterns.some((pattern) => pattern.test(normalizeKey(key)))) return value.trim();
  }
  return undefined;
}

function findNumber(record: RecordValue, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "number" && patterns.some((pattern) => pattern.test(normalizeKey(key)))) return value;
  }
  return undefined;
}

function routeInfo(record: RecordValue): RouteInfo | null {
  const start = findText(record, [/^start(city)?$/, /^origin$/, /^from$/, /^loadcity$/, /^pickup/, /^taskstart$/]);
  const destination = findText(record, [/^dest(city)?$/, /^destination$/, /^to$/, /^unloadcity$/, /^delivery/, /^taskdest$/]);
  if (!start && !destination) return null;
  return {
    start,
    startCompany: findText(record, [/^startcompany$/, /^loadcompany$/, /^pickupcompany$/]),
    destination,
    destinationCompany: findText(record, [/^destcompany$/, /^destinationcompany$/, /^unloadcompany$/, /^deliverycompany$/]),
    distance: findNumber(record, [/^totaldistance$/, /^distance$/]),
    currentDistance: findNumber(record, [/^currentdistance$/]),
  };
}

function primitiveEntries(record: RecordValue) {
  return Object.entries(record).filter(([, value]) => isPrimitive(value) && !isEmpty(value));
}

function metricScore(key: string, value: unknown) {
  const normalized = normalizeKey(key);
  if (HIDDEN_PATTERNS.some((pattern) => pattern.test(normalized))) return -100;
  if (/^(id|steamid|discorduid)$/i.test(normalized)) return -20;
  if (TITLE_KEYS.some((candidate) => normalizeKey(candidate) === normalized)) return -20;
  if (STATUS_KEYS.some((candidate) => normalizeKey(candidate) === normalized)) return -20;
  if (typeof value === "number") {
    if (/(eur|balance|amount|price|revenue|income|expense|distance|km|odometer|velocity|speed|fuel|damage|place|rank|count|total)/i.test(normalized)) return 100;
    return 45;
  }
  if (typeof value === "boolean") return 30;
  if (typeof value === "string" && looksLikeDate(key, value)) return 70;
  return 5;
}

function importantEntries(record: RecordValue, limit = 6) {
  return primitiveEntries(record)
    .map(([key, value]) => ({ key, value, score: metricScore(key, value) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function iconForKey(key: string) {
  const normalized = normalizeKey(key);
  if (/(eur|balance|amount|price|revenue|income|expense)/i.test(normalized)) return Banknote;
  if (/(distance|km|odometer|route)/i.test(normalized)) return Route;
  if (/(velocity|speed)/i.test(normalized)) return Gauge;
  if (/fuel/i.test(normalized)) return Fuel;
  if (/damage|maintenance|repair/i.test(normalized)) return Wrench;
  if (/(date|time|arrival|expires|created|updated)/i.test(normalized)) return CalendarDays;
  if (/(user|driver|name|profile)/i.test(normalized)) return UserRound;
  if (/(company|spedition|branch)/i.test(normalized)) return Building2;
  return CircleGauge;
}

function unpackList(data: unknown): RecordValue[] | null {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return null;
  for (const key of ["items", "data", "results", "records", "entries", "value", "content"]) {
    if (Array.isArray(data[key])) return (data[key] as unknown[]).filter(isRecord);
  }
  return null;
}

function MetricGrid({ record, limit = 6 }: { record: RecordValue; limit?: number }) {
  const metrics = importantEntries(record, limit);
  if (!metrics.length) return null;
  return (
    <div className="smart-metrics">
      {metrics.map(({ key, value }) => {
        const Icon = iconForKey(key);
        return (
          <div className="smart-metric" key={key}>
            <Icon size={16} />
            <div><strong>{formatValue(key, value)}</strong><span>{friendlyLabel(key)}</span></div>
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({ route }: { route: RouteInfo }) {
  const progress = route.distance && route.currentDistance !== undefined
    ? Math.max(0, Math.min(100, (route.currentDistance / route.distance) * 100))
    : null;
  return (
    <section className="smart-route">
      <div className="smart-route-head"><Navigation size={17} /><strong>Route</strong>{route.distance !== undefined && <span>{formatValue("distance", route.distance)}</span>}</div>
      <div className="smart-route-points">
        <div className="smart-route-point"><span className="route-dot start" /><div><strong>{route.start || "Start unbekannt"}</strong>{route.startCompany && <span>{route.startCompany}</span>}</div></div>
        <div className="route-track">{progress !== null && <i style={{ width: `${progress}%` }} />}</div>
        <ChevronRight size={17} />
        <div className="smart-route-point"><span className="route-dot destination" /><div><strong>{route.destination || "Ziel unbekannt"}</strong>{route.destinationCompany && <span>{route.destinationCompany}</span>}</div></div>
      </div>
      {progress !== null && <div className="smart-route-progress">{formatNumber(route.currentDistance || 0)} von {formatNumber(route.distance || 0)} km · {formatNumber(progress, 0)} %</div>}
    </section>
  );
}

function InfoGrid({ record, excluded = [] }: { record: RecordValue; excluded?: string[] }) {
  const excludedKeys = new Set(excluded.map(normalizeKey));
  const entries = primitiveEntries(record)
    .filter(([key]) => !excludedKeys.has(normalizeKey(key)))
    .filter(([key]) => !HIDDEN_PATTERNS.some((pattern) => pattern.test(normalizeKey(key))))
    .slice(0, 20);
  if (!entries.length) return null;
  return (
    <div className="smart-info-grid">
      {entries.map(([key, value]) => (
        <div className="smart-info" key={key}>
          <span>{friendlyLabel(key)}</span>
          <strong>{formatValue(key, value)}</strong>
        </div>
      ))}
    </div>
  );
}

function EntityCard({ record, index }: { record: RecordValue; index: number }) {
  const title = primaryTitle(record, `Eintrag ${index + 1}`);
  const status = statusValue(record);
  const image = imageUrl(record);
  const route = routeInfo(record);
  const subtitle = firstText(record, ["company", "spedition", "city", "task_Freight", "freight", "truckModel"]);
  const metricKeys = importantEntries(record, 4).map((entry) => entry.key);

  return (
    <article className="smart-entity">
      <div className="smart-entity-head">
        <div className="smart-avatar">{image ? <img src={image} alt="" loading="lazy" /> : <UserRound size={20} />}</div>
        <div className="smart-entity-title"><strong>{title}</strong>{subtitle && subtitle !== title && <span>{subtitle}</span>}</div>
        {status && <span className={`badge ${statusTone(status)}`}>{status}</span>}
      </div>
      {route && <RouteCard route={route} />}
      <MetricGrid record={record} limit={4} />
      <details className="smart-more">
        <summary>Mehr anzeigen</summary>
        <InfoGrid record={record} excluded={[...metricKeys, ...TITLE_KEYS, ...STATUS_KEYS]} />
        {Object.entries(record).filter(([, value]) => isRecord(value)).slice(0, 3).map(([key, value]) => (
          <div className="smart-nested" key={key}><h4>{friendlyLabel(key)}</h4><InfoGrid record={value as RecordValue} /></div>
        ))}
      </details>
    </article>
  );
}

function ObjectView({ record }: { record: RecordValue }) {
  const title = primaryTitle(record);
  const image = imageUrl(record);
  const status = statusValue(record);
  const route = routeInfo(record);
  const metricKeys = importantEntries(record, 8).map((entry) => entry.key);
  const nestedObjects = Object.entries(record).filter(([, value]) => isRecord(value));
  const nestedLists = Object.entries(record).filter(([, value]) => Array.isArray(value) && (value as unknown[]).some(isRecord));

  return (
    <div className="smart-object">
      {(title || image || status) && (
        <div className="smart-profile-head">
          <div className="smart-profile-image">{image ? <img src={image} alt="" /> : <UserRound size={28} />}</div>
          <div><h3>{title || "SPEDV-Daten"}</h3><span>Aktuelle Informationen</span></div>
          {status && <span className={`badge ${statusTone(status)}`}>{status}</span>}
        </div>
      )}
      {route && <RouteCard route={route} />}
      <MetricGrid record={record} limit={8} />
      <InfoGrid record={record} excluded={[...metricKeys, ...TITLE_KEYS, ...STATUS_KEYS]} />

      {nestedObjects.slice(0, 8).map(([key, value]) => (
        <section className="smart-section" key={key}>
          <h3>{friendlyLabel(key)}</h3>
          <MetricGrid record={value as RecordValue} limit={4} />
          <InfoGrid record={value as RecordValue} />
        </section>
      ))}

      {nestedLists.slice(0, 6).map(([key, value]) => (
        <section className="smart-section" key={key}>
          <div className="smart-section-head"><h3>{friendlyLabel(key)}</h3><span>{(value as unknown[]).length}</span></div>
          <div className="smart-list">{(value as unknown[]).filter(isRecord).slice(0, 20).map((item, index) => <EntityCard record={item} index={index} key={index} />)}</div>
        </section>
      ))}
    </div>
  );
}

function PrimitiveView({ data }: { data: unknown }) {
  if (typeof data === "boolean") {
    return <div className={`smart-state ${data ? "good" : "bad"}`}>{data ? <CheckCircle2 size={28} /> : <ShieldAlert size={28} />}<div><strong>{data ? "Aktiv" : "Nicht aktiv"}</strong><span>Aktueller SPEDV-Status</span></div></div>;
  }
  return <div className="smart-state"><CircleGauge size={28} /><div><strong>{String(data ?? "Keine Daten")}</strong><span>SPEDV-Antwort</span></div></div>;
}

function ContextHeader({ context, count }: { context?: string; count?: number }) {
  const normalized = (context || "").toLowerCase();
  const Icon = /online|live/.test(normalized) ? UsersRound
    : /vehicle|truck|fleet|fuhrpark/.test(normalized) ? Truck
      : /bank|finance|money|finanz/.test(normalized) ? Banknote
        : /company|spedition/.test(normalized) ? Building2
          : /route|tour|order|auftrag/.test(normalized) ? MapPin
            : /time|history/.test(normalized) ? Clock3
              : CircleGauge;
  return (
    <div className="smart-context">
      <div className="smart-context-icon"><Icon size={18} /></div>
      <div><strong>{context || "Aktuelle Daten"}</strong><span>{typeof count === "number" ? `${count} Einträge` : "Von SPEDV geladen"}</span></div>
    </div>
  );
}

export function SmartDataView({ data, title = "spedv-data", context }: Props) {
  const list = unpackList(data);
  return (
    <div className="smart-data-view">
      {list ? (
        <>
          <ContextHeader context={context} count={list.length} />
          {list.length ? <div className="smart-list">{list.slice(0, 100).map((record, index) => <EntityCard record={record} index={index} key={index} />)}</div> : <div className="smart-empty"><CheckCircle2 size={24} /><strong>Keine Einträge</strong><span>Für diesen Bereich liegen aktuell keine Daten vor.</span></div>}
        </>
      ) : isRecord(data) ? (
        <><ContextHeader context={context} /><ObjectView record={data} /></>
      ) : <PrimitiveView data={data} />}

      <details className="technical-details">
        <summary>Technische Details & Export</summary>
        <DataView data={data} title={title} />
      </details>
    </div>
  );
}
