# SPEDV Mobile

Private, installierbare iPhone-PWA für die dokumentierte SPEDV-API.

## Enthalten

- automatische Swagger/OpenAPI-Erkennung
- dynamischer Katalog für sämtliche dokumentierten Endpunkte
- moderne iPhone-Oberfläche mit Startseite, Bereichen, Suche, Favoriten und Verlauf
- automatische Authentifizierungs-Erkennung
- API-Key wird einmalig eingegeben und lokal per AES-GCM verschlüsselt gespeichert
- sicherer Server-Proxy mit festem Allowlisting für `api.sped-v.de`
- GET, POST, PUT, PATCH, DELETE, HEAD und OPTIONS
- Query-, Path-, Header- und Form-Parameter
- JSON-Body, Formulardaten und Datei-Uploads
- Tabellen-/JSON-Ansicht sowie CSV-/JSON-Export
- Binärdatei-Downloads
- lokaler Cache und Offline-App-Shell
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

Der API-Key liegt weder im Repository noch dauerhaft auf dem Hosting-Server. Er wird auf dem Gerät mit einem nicht exportierbaren AES-GCM-Schlüssel in IndexedDB verschlüsselt. Der Proxy akzeptiert ausschließlich HTTPS-Aufrufe an den freigegebenen SPEDV-Host.

SPEDV Mobile ist eine unabhängige Drittanbieter-Oberfläche und steht nicht in offizieller Verbindung mit Freie Programme Hohenstein oder SPEDV.
