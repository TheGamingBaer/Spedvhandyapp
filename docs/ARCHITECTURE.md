# RoadDesk architecture

The private iPhone release is delivered as a Next.js PWA with an iPhone-optimized UI, encrypted device-local credentials, a same-origin backend-for-frontend proxy, dynamic OpenAPI discovery, offline app-shell caching and installable Home Screen metadata.

The architecture keeps the SPEDV API key outside the repository and blocks proxy requests to non-SPEDV hosts.
