# Security baseline

- SPEDV credentials are never committed.
- The API key is encrypted locally with a non-exportable AES-GCM device key in IndexedDB.
- The backend proxy only permits HTTPS requests to approved SPEDV hosts.
- Write operations require explicit opt-in and confirmation.
