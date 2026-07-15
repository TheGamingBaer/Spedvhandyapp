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
  | "documents";

export interface SpedvModuleDefinition {
  id: string;
  title: string;
  description: string;
  icon: SpedvModuleIcon;
  exactPaths: string[];
  keywords: RegExp[];
}

export const SPEDV_MODULES: SpedvModuleDefinition[] = [
  {
    id: "profile",
    title: "Mein Profil",
    description: "Benutzerkonto, Rollen und persönliche SPEDV-Daten",
    icon: "profile",
    exactPaths: ["/v1/user", "/v1/auth/claims/apikey"],
    keywords: [/\/user$/i, /profile/i, /account.*user/i],
  },
  {
    id: "company",
    title: "Meine Spedition",
    description: "Spedition, Partnerschaften und Konten",
    icon: "company",
    exactPaths: ["/v1/spedition/accounts"],
    keywords: [/spedition/i, /company/i, /partnership/i],
  },
  {
    id: "orders",
    title: "Aufträge & Touren",
    description: "Transportaufträge, Touren und Lieferungen",
    icon: "orders",
    exactPaths: ["/v1/orders", "/v1/jobs", "/v1/tours"],
    keywords: [/order/i, /auftrag/i, /job/i, /tour/i, /shipment/i, /transport/i],
  },
  {
    id: "vehicles",
    title: "Fuhrpark",
    description: "LKW, Trailer und Fahrzeugdaten",
    icon: "vehicles",
    exactPaths: ["/v1/vehicles", "/v1/trucks", "/v1/trailers"],
    keywords: [/vehicle/i, /truck/i, /trailer/i, /fleet/i, /fahrzeug/i],
  },
  {
    id: "drivers",
    title: "Fahrer & Nutzer",
    description: "Mitarbeiter, Fahrer und Nutzerprofile",
    icon: "drivers",
    exactPaths: ["/v1/users", "/v1/userprofiles"],
    keywords: [/driver/i, /fahrer/i, /users$/i, /userprofiles/i, /employee/i],
  },
  {
    id: "online",
    title: "Live-Status",
    description: "Aktuell aktive und online befindliche Nutzer",
    icon: "online",
    exactPaths: ["/v1/live/onlineusers", "/v1/live/onlineuser"],
    keywords: [/onlineusers/i, /live.*user/i, /online/i],
  },
  {
    id: "stats",
    title: "Statistiken",
    description: "Leistung, Kilometer und persönliche Auswertungen",
    icon: "stats",
    exactPaths: ["/v1/spedition/stats/user"],
    keywords: [/stats/i, /statistics/i, /summary/i, /dashboard/i, /overview/i],
  },
  {
    id: "vacations",
    title: "Urlaub & Abwesenheit",
    description: "Urlaubs- und Abwesenheitsdaten",
    icon: "vacations",
    exactPaths: ["/v1/vacations"],
    keywords: [/vacation/i, /absence/i, /urlaub/i],
  },
  {
    id: "bank",
    title: "Finanzen",
    description: "Bankkonten, Buchungen und Übersichten",
    icon: "bank",
    exactPaths: ["/v1/bankaccounts"],
    keywords: [/bankaccount/i, /finance/i, /transfer/i, /payment/i],
  },
  {
    id: "documents",
    title: "Dokumente",
    description: "Dokumente, Archive und Dateien",
    icon: "documents",
    exactPaths: ["/v1/documents", "/v1/files"],
    keywords: [/document/i, /archive/i, /file/i, /attachment/i],
  },
];

function canLoadAutomatically(endpoint: ApiEndpoint) {
  if (endpoint.method !== "get") return false;
  return !endpoint.parameters.some(
    (parameter) => parameter.required && ["path", "query", "header"].includes(parameter.in),
  );
}

export function resolveModuleEndpoint(definition: SpedvModuleDefinition, endpoints: ApiEndpoint[]) {
  const safeEndpoints = endpoints.filter(canLoadAutomatically);

  for (const path of definition.exactPaths) {
    const exact = safeEndpoints.find((endpoint) => endpoint.path.toLowerCase() === path.toLowerCase());
    if (exact) return exact;
  }

  return safeEndpoints.find((endpoint) => {
    const haystack = `${endpoint.path} ${endpoint.tag} ${endpoint.summary} ${endpoint.operationId || ""}`;
    return definition.keywords.some((keyword) => keyword.test(haystack));
  });
}
