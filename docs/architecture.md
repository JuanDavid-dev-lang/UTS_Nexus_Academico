# Arquitectura

```mermaid
flowchart LR
  F[Flutter Mobile] -->|REST/JWT| B[Backend Node.js]
  P[Python Desktop] -->|REST/JWT| B
  F <--> |WebSocket| W[Sync Gateway]
  P <--> |WebSocket| W
  B --> M[(MongoDB Atlas)]
  B --> S[(Object Storage)]
  B --> N[Push/Email/SMS]
  B --> AI[Servicios IA]
  W --> M
```

## Capas

- `apps/mobile_flutter`
- `apps/desktop_python`
- `services/api`
- `docs`

## Principios

- Clean Architecture
- SOLID
- Repository Pattern
- Auditable
- Soft delete
- Multi-rol

