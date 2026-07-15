# SPEDV API capability matrix

This matrix is generated and verified from the official OpenAPI document at runtime. The app intentionally does not invent private endpoints.

| Capability | API source | Read | Write | Offline | Notes |
|---|---|---:|---:|---:|---|
| API discovery | Official Swagger/OpenAPI | Yes | No | Cached | All documented paths and methods are parsed dynamically. |
| User and company data | Matching documented endpoints | When exposed | When exposed | Last response | Availability depends on API key and SPEDV role. |
| Orders and tours | Matching documented endpoints | When exposed | When exposed | Last response | Critical writes require confirmation. |
| Drivers and employees | Matching documented endpoints | When exposed | When exposed | Last response | Role-based authorization remains enforced by SPEDV. |
| Vehicles, trailers and branches | Matching documented endpoints | When exposed | When exposed | Last response | No undocumented scraping is used. |
| Finance | Matching documented endpoints | When exposed | When exposed | Last response | Financial writes require explicit write-mode opt-in. |
| Documents and exports | Binary/JSON endpoints | When exposed | Upload when exposed | Downloaded locally | Multipart upload and binary download are supported. |
| Live telemetry | Not guaranteed by REST API | Partial | No | Last known | Requires an official endpoint or a future local PC bridge. |
| Push notifications | No generic REST guarantee | Partial | No | No | Requires backend scheduling and event availability. |
| Native widgets / Live Activities | Not part of PWA release | No | No | No | Requires a separately signed native iOS target. |

## Rules

- The interface shows only capabilities present in the loaded specification.
- Unsupported functions are not simulated.
- The authentication scheme is detected from OpenAPI security definitions and verified with safe GET probes.
- Writing is disabled by default.
- Cached responses are visibly marked with their timestamp.
