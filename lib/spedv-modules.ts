import type { ApiEndpoint } from "@/lib/types";

export type SpedvModuleIcon =
  | "profile"
  | "company"
  | "orders"
  | "vehicles"
  | "drivers"
  | "online"
  | "stats"
  | "vacations"
  | "bank"
  | "documents"
  | "generic";

export interface SpedvModuleDefinition {
  id: string;
  title: string;
  description: string;
  icon: SpedvModuleIcon;
  exactPaths: string[];
  keywords: RegExp[];
  autoLimit?: number;
}

export interface ResolvedSpedvModule {
  id: string;
  title: string;
  description: string;
  icon: SpedvModuleIcon;
  endpoints: ApiEndpoint[];
  automaticEndpoints: ApiEndpoint[];
}

const DEFINITIONS: SpedvModuleDefinition[] = [
  {
    id: "profile",
    title: "Mein Profil",
    description: "Benutzerkonto, Rollen und persönliche SPEDV-Daten",
    icon: "profile",
    exactPaths: ["/v1/user"],
    keywords: [/\/user$/i, /profile/i],
    autoLimit: 2,
  },
  {
    id: "company",
    title: "Meine Spedition",
    description: "Spedition, Partnerschaften und Konten",
    icon: "company",
    exactPaths: ["/v1/spedition/accounts"],
    keywords: [/company/i, /partnership/i, /spedition.*account/i, /spedition/i],
    autoLimit: 4,
  },
  {
    id: "orders",
    title: "Aufträge & Touren",
    description: "Transportaufträge, Touren und Lieferungen",
    icon: "orders",
    exactPaths: ["/v1/orders", "/v1/jobs", "/v1/tours"],
    keywords: [/order/i, /auftrag/i, /job/i, /tour/i, /shipment/i, /transport/i, /freight/i, /task/i],
    autoLimit: 4,
  },
  {
    id: "vehicles",
    title: "Fuhrpark",
    description: "LKW, Trailer und Fahrzeugdaten",
    icon: "vehicles",
    exactPaths: ["/v1/vehicles", "/v1/trucks", "/v1/trailers"],
    keywords: [/vehicle/i, /truck/i, /trailer/i, /fleet/i, /fahrzeug/i, /maintenance/i],
    autoLimit: 4,
  },
  {
    id: "drivers",
    title: "Fahrer & Nutzer",
    description: "Mitarbeiter, Fahrer und Nutzerprofile",
    icon: "drivers",
    exactPaths: ["/v1/users", "/v1/userprofiles"],
    keywords: [/driver/i, /fahrer/i, /users$/i, /userprofiles/i, /employee/i],
    autoLimit: 3,
  },
  {
    id: "online",
    title: "Live-Status",
    description: "Aktuell aktive Nutzer, Fahrten und Live-Daten",
    icon: "online",
    exactPaths: ["/v1/live/onlineusers", "/v1/live/onlineuser"],
    keywords: [/onlineusers/i, /live.*user/i, /online/i, /convoy/i],
    autoLimit: 3,
  },
  {
    id: "stats",
    title: "Statistiken",
    description: "Leistung, Kilometer, Umsatz und Platzierungen",
    icon: "stats",
    exactPaths: ["/v1/spedition/stats/user"],
    keywords: [/stats/i, /statistics/i, /summary/i, /dashboard/i, /overview/i, /ranking/i, /place/i],
    autoLimit: 4,
  },
  {
    id: "vacations",
    title: "Urlaub & Abwesenheit",
    description: "Urlaubs- und Abwesenheitsdaten",
    icon: "vacations",
    exactPaths: ["/v1/vacations"],
    keywords: [/vacation/i, /absence/i, /urlaub/i],
    autoLimit: 2,
  },
  {
    id: "bank",
    title: "Finanzen",
    description: "Bankkonten, Buchungen und Übersichten",
    icon: "bank",
    exactPaths: ["/v1/bankaccounts"],
    keywords: [/bankaccount/i, /finance/i, /transfer/i, /payment/i, /money/i],
    autoLimit: 3,
  },
  {
    id: "documents",
    title: "Dokumente",
    description: "Dokumente, Archive und Dateien",
    icon: "documents",
    exactPaths: ["/v1/documents", "/v1/files"],
    keywords: [/document/i, /archive/i, /file/i, /attachment/i, /skin/i],
    autoLimit: 3,
  },
];

export function canLoadAutomatically(endpoint: ApiEndpoint) {
  if (endpoint.method !== "get") return false;
  if (/\/auth\/(clientkey|steamticket|register|steamopenid|claims)/i.test(endpoint.path)) return false;
  if (/\/(download|export|image|file)\b/i.test(endpoint.path) && endpoint.produces.some((type) => !type.includes("json") && !type.includes("text"))) return false;
  return !endpoint.parameters.some(
    (parameter) => parameter.required && ["path", "query", "header"].includes(parameter.in),
  );
}

function matchesKeywords(endpoint: ApiEndpoint, definition: SpedvModuleDefinition) {
  const haystack = `${endpoint.path} ${endpoint.tag} ${endpoint.summary} ${endpoint.operationId || ""}`;
  return definition.keywords.some((keyword) => keyword.test(haystack));
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function automaticScore(endpoint: ApiEndpoint, exactPaths: string[]) {
  let score = 0;
  const text = `${endpoint.path} ${endpoint.summary} ${endpoint.operationId || ""}`;
  if (exactPaths.some((path) => path.toLowerCase() === endpoint.path.toLowerCase())) score += 1000;
  if (/\b(my|current|overview|dashboard|summary|list|all|online|accounts|stats|status)\b/i.test(text)) score += 100;
  if (/\b(search|history|archive|export|download|lookup|validate|test)\b/i.test(text)) score -= 80;
  score -= endpoint.parameters.length * 8;
  score -= endpoint.path.split("/").filter(Boolean).length * 3;
  return score;
}

function selectAutomatic(endpoints: ApiEndpoint[], definition?: SpedvModuleDefinition) {
  const exactPaths = definition?.exactPaths || [];
  const limit = definition?.autoLimit || 2;
  return endpoints
    .filter(canLoadAutomatically)
    .sort((a, b) => automaticScore(b, exactPaths) - automaticScore(a, exactPaths) || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export function buildSpedvModules(endpoints: ApiEndpoint[]): ResolvedSpedvModule[] {
  const usable = endpoints.filter((endpoint) => !/^auth$/i.test(endpoint.tag));
  const assigned = new Set<string>();
  const buckets = new Map<string, ApiEndpoint[]>();

  for (const definition of DEFINITIONS) {
    const exact = usable.filter((endpoint) =>
      !assigned.has(endpoint.id)
      && definition.exactPaths.some((path) => path.toLowerCase() === endpoint.path.toLowerCase()),
    );
    if (exact.length) {
      buckets.set(definition.id, [...(buckets.get(definition.id) || []), ...exact]);
      exact.forEach((endpoint) => assigned.add(endpoint.id));
    }
  }

  for (const definition of DEFINITIONS) {
    const matching = usable.filter((endpoint) => !assigned.has(endpoint.id) && matchesKeywords(endpoint, definition));
    if (matching.length) {
      buckets.set(definition.id, [...(buckets.get(definition.id) || []), ...matching]);
      matching.forEach((endpoint) => assigned.add(endpoint.id));
    }
  }

  const modules: ResolvedSpedvModule[] = DEFINITIONS.flatMap((definition) => {
    const matching = buckets.get(definition.id) || [];
    if (!matching.length) return [];
    return [{
      id: definition.id,
      title: definition.title,
      description: definition.description,
      icon: definition.icon,
      endpoints: matching,
      automaticEndpoints: selectAutomatic(matching, definition),
    }];
  });

  const remainingByTag = new Map<string, ApiEndpoint[]>();
  for (const endpoint of usable) {
    if (assigned.has(endpoint.id)) continue;
    const list = remainingByTag.get(endpoint.tag) || [];
    list.push(endpoint);
    remainingByTag.set(endpoint.tag, list);
  }

  for (const [tag, matching] of [...remainingByTag.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    modules.push({
      id: `tag:${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: titleCase(tag),
      description: `${matching.length} SPEDV-Funktionen in diesem Bereich`,
      icon: "generic",
      endpoints: matching,
      automaticEndpoints: selectAutomatic(matching),
    });
  }

  return modules;
}
