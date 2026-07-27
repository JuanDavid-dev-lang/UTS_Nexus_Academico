# UTS Nexus Académico

Plataforma académica unificada de la Universidad de Santander (UTS): app móvil
(docente/estudiante), app de escritorio (admin/docente) y un backend central
sobre MongoDB Atlas, todo sincronizado en tiempo real.

## Arranque rápido

1. Copia `backend/.env.example` a `backend/.env` y define `MONGODB_URI`.
2. Ejecuta el arranque automático (instala, compila, siembra, levanta y prueba):
   - Windows: `powershell -ExecutionPolicy Bypass -File .\iniciar.ps1`
   - Linux/Mac/Git Bash: `./iniciar.sh`
3. API en `http://localhost:4000` · Swagger en `http://localhost:4000/docs`.

Guía de uso: `docs/FUNCIONAMIENTO.md` · Detalle técnico: `docs/REFACTOR.md` ·
Arranque paso a paso: `README.txt`.

## Stack

- Flutter: app móvil docente
- Python: escritorio administrativo
- Node.js + Express + TypeScript: backend
- MongoDB Atlas: base central
- WebSockets + JWT: sincronización en tiempo real
- IA: analítica, predicción y asistente académico

## Entrega rápida

- Arquitectura: `docs/architecture.md`
- Base de datos: `docs/database.md`
- API: `docs/api.md`
- UI: `docs/ui.md`
- Casos de uso: `docs/use-cases.md`
- Historias: `docs/user-stories.md`
- Roadmap: `docs/roadmap.md`

## Docker

- API: `docker compose up --build`
- Imagen: `backend/Dockerfile`
- Compose: `docker-compose.yml`
