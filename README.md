# SPEDV Mobile

Installierbare iPhone-PWA für die dokumentierte SPEDV-API.

## Bedienung

1. App öffnen.
2. Einmal den persönlichen SPEDV-Hauptschlüssel eintragen.
3. Die App erkennt Anmeldung und API-Struktur automatisch.
4. Profil, Spedition, Fahrer, Fuhrpark, Statistiken, Finanzen und alle weiteren verfügbaren Bereiche werden direkt als fertige Ansichten geladen.

Es müssen keine API-Adressen, Swagger-URLs oder einzelnen Endpunkte eingetragen werden.

## Enthalten

- automatische Live-Erkennung der offiziellen SPEDV-OpenAPI
- vollständig gebündelte SPEDV-API als Ausfallsicherung
- fertige, automatisch sortierte SPEDV-Bereiche
- automatische Aktualisierung aller direkt abrufbaren Daten
- Detailformulare nur dort, wo SPEDV zwingend eine ID oder Eingabe verlangt
- Unterstützung für API-Key und Client-Key-zu-JWT-Austausch
- lokal per AES-GCM verschlüsselter Hauptschlüssel
- sicherer Server-Proxy mit festem Allowlisting für `api.sped-v.de`
- GET, POST, PUT, PATCH, DELETE, HEAD und OPTIONS
- Query-, Path-, Header-, Formular- und Datei-Parameter
- Tabellen-/JSON-Ansicht sowie CSV-/JSON-Export
- lokaler Cache, Verlauf und Offline-App-Shell
- Schutzschalter und Doppelbestätigung für schreibende Aktionen
- PWA-Manifest, App-Icon und Service Worker

## Lokale Prüfung

```bash
npm install
npm run typecheck
npm run build
```

## Vercel

Das Repository direkt als Next.js-Projekt importieren. Es werden keine geheimen Server-Umgebungsvariablen benötigt. Optional kann `SPEDV_API_BASE_URL=https://api.sped-v.de` gesetzt werden.

Nach dem Deployment die URL auf dem iPhone in Safari öffnen und über **Teilen → Zum Home-Bildschirm** installieren.

## Sicherheit

Der SPEDV-Hauptschlüssel liegt weder im Repository noch dauerhaft auf dem Hosting-Server. Er wird auf dem Gerät mit einem nicht exportierbaren AES-GCM-Schlüssel in IndexedDB verschlüsselt. Der Proxy akzeptiert ausschließlich HTTPS-Aufrufe an `api.sped-v.de`.

SPEDV Mobile ist eine unabhängige Drittanbieter-Oberfläche und steht nicht in offizieller Verbindung mit Freie Programme Hohenstein oder SPEDV.
