# Arquitectura V2 — UTS Nexus Académico (Escritorio)

`Fase 2 · Diseño de la nueva arquitectura` · Estado: aprobado para implementación

Documento de decisión técnica para la reestructuración completa del cliente de
escritorio. Sustituye a `desktop_python/` (PySide6).

---

## 1. Resumen de la decisión

| Componente | Antes | Después | Motivo |
|---|---|---|---|
| Cliente escritorio | PySide6 (Python) | **Tauri 2 + React 19 + TypeScript** | Techo visual, ecosistema de componentes, binario ~8 MB vs ~120 MB |
| Backend | Node/TS + Express + Mongoose | **sin cambios** | Ya funciona, ya tiene JWT/roles/zod/socket.io |
| Base de datos | MongoDB Atlas | **sin cambios** | Restricción del proyecto: compatibilidad total |
| Motor ML | no existe | **Python + FastAPI + scikit-learn** | Servicio nuevo, aislado |
| LLM | Ollama vía backend | **sin cambios + memoria (RAG)** | Ya está desacoplado en `assistant.service.ts` |

**Principio rector:** el cliente de escritorio es una *capa de presentación*. Toda
regla de negocio vive en el backend (fuente única para escritorio, móvil y web).
No se duplica lógica académica en el cliente.

---

## 2. Stack del cliente y justificación

Cada dependencia debe justificar su peso. Nada entra "porque es moderno".

| Tecnología | Rol | Por qué esta y no otra |
|---|---|---|
| **Tauri 2** | Shell nativo | Usa el WebView del sistema: binario ~8 MB y ~60 MB de RAM, contra ~120 MB y ~300 MB de Electron. Backend en Rust, sin Node embebido. |
| **React 19 + TypeScript** | UI | Tipado extremo a extremo con el backend (que ya es TS). Los tipos del dominio se comparten, no se reescriben. |
| **Vite** | Build | HMR instantáneo. Requisito de Tauri. |
| **TailwindCSS** | Estilos | Tokens del `DESIGN.md` como variables CSS. Elimina los `setStyleSheet` sueltos del código anterior. |
| **shadcn/ui** | Componentes | El código vive en el repo, no en `node_modules`. Se puede modificar sin luchar contra la librería. Base Radix = accesibilidad real. |
| **TanStack Query** | Estado de servidor | Caché, reintentos, deduplicación e invalidación. Resuelve solo el problema de rendimiento #1 del cliente anterior. |
| **Zustand** | Estado de cliente | Sesión, tema y preferencias de UI. 1 KB. Redux sería sobreingeniería para este alcance. |
| **Framer Motion** | Animación | Microanimaciones y transiciones de página declarativas. |
| **ECharts** | Gráficos | Renderiza en canvas: series grandes sin degradar. Mejor que D3 en costo de mantenimiento. |
| **socket.io-client** | Tiempo real | El backend ya expone socket.io con handshake JWT. |
| **Vitest + Testing Library + Playwright** | Pruebas | Unitarias, de componente y E2E sobre el binario. |

### Tecnologías evaluadas y descartadas

- **gRPC**: el backend expone REST + WebSocket y los consume también el móvil Flutter. Añadir gRPC obliga a mantener dos contratos. Sin beneficio a esta escala.
- **Redis**: el caché de servidor no es el cuello de botella; el caché de cliente (TanStack Query) sí. Se reevalúa si aparece carga real.
- **PostgreSQL**: el dominio es documental y MongoDB Atlas ya está en producción. Migrar violaría la restricción de compatibilidad.
- **Sistema de plugins**: YAGNI. Con 9 módulos, el registro de rutas por *feature folder* da la misma modularidad sin el costo de un runtime de plugins.
- **Redux Toolkit**: TanStack Query cubre el estado de servidor y Zustand el de cliente. Redux quedaría sin responsabilidad propia.

---

## 3. Estructura de carpetas

Arquitectura por *features* (Screaming Architecture): la estructura grita
**qué hace el sistema**, no qué framework usa.

```
desktop/
├── src-tauri/                     # Shell nativo (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/              # Comandos expuestos al frontend
│   │   │   ├── secure_store.rs    # Tokens en el llavero del SO
│   │   │   └── backend_process.rs # Arranque/salud del backend Node
│   │   └── lib.rs
│   ├── icons/
│   ├── capabilities/              # Permisos de Tauri (allowlist)
│   └── tauri.conf.json
│
├── src/
│   ├── app/                       # Composición raíz
│   │   ├── App.tsx
│   │   ├── router.tsx             # Rutas + carga diferida por feature
│   │   ├── providers.tsx          # Query, tema, toasts, error boundary
│   │   └── shortcuts.ts           # Atajos globales
│   │
│   ├── core/                      # Núcleo agnóstico de UI
│   │   ├── api/
│   │   │   ├── http-client.ts     # fetch + refresh de token ante 401
│   │   │   ├── endpoints.ts
│   │   │   └── errors.ts          # Errores tipados del dominio
│   │   ├── auth/
│   │   │   ├── session.store.ts
│   │   │   ├── token.service.ts   # Llavero del SO vía Tauri
│   │   │   └── permissions.ts     # Roles y capacidades
│   │   ├── realtime/socket.ts
│   │   ├── config/env.ts          # Config tipada, cero URLs quemadas
│   │   └── result.ts              # Result<T, E> — sin excepciones tragadas
│   │
│   ├── domain/                    # Modelos y contratos (sin React)
│   │   ├── models/                # student.ts, grade.ts, risk.ts, ...
│   │   ├── schemas/               # Validación zod de las respuestas
│   │   └── repositories/          # Interfaces (puertos)
│   │
│   ├── infrastructure/            # Implementaciones (adaptadores)
│   │   └── repositories/          # http-student.repository.ts, ...
│   │
│   ├── features/                  # Un módulo por capacidad del negocio
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   ├── hooks/             # use-dashboard-metrics.ts
│   │   │   ├── services/
│   │   │   └── index.tsx
│   │   ├── students/
│   │   ├── subjects/
│   │   ├── grades/
│   │   ├── attendance/
│   │   ├── assistant/             # Chat IA + memoria
│   │   ├── predictions/           # Riesgo con ML
│   │   ├── reports/
│   │   ├── notifications/
│   │   └── settings/
│   │
│   ├── shared/
│   │   ├── ui/                    # Sistema de componentes (shadcn + propios)
│   │   ├── layouts/               # AppShell, Sidebar, TopBar, TabBar
│   │   ├── hooks/                 # use-debounce, use-virtual-list, ...
│   │   └── lib/
│   │
│   ├── styles/
│   │   ├── tokens.css             # Tokens del DESIGN.md
│   │   └── themes/                # light / dark / auto
│   └── main.tsx
│
├── tests/{unit,integration,e2e}/
└── package.json
```

**Regla de dependencia (Arquitectura Hexagonal):**
`features → domain ← infrastructure`. El dominio no importa React, ni `fetch`,
ni Tauri. Se puede probar sin levantar la UI.

---

## 4. Flujo de datos

```
Componente React
      │  usa
      ▼
Hook de feature (useStudents)
      │  delega en
      ▼
TanStack Query  ──►  caché · reintentos · invalidación
      │
      ▼
Repositorio (puerto)  ──►  HttpStudentRepository (adaptador)
      │
      ▼
HttpClient  ──►  refresh automático ante 401  ──►  zod valida la respuesta
      │
      ▼
Backend Express  ──►  Mongoose  ──►  MongoDB Atlas
      ▲
      └── socket.io empuja cambios ──► invalida la query ──► la UI se repinta
```

Ningún componente llama a la red directamente. Ese fue el error central de la
versión anterior: 26 llamadas HTTP repartidas por los widgets.

---

## 5. Machine Learning — qué es real y qué no

### Aclaración necesaria

Un LLM local (Ollama) **no aprende solo**. Cada respuesta parte de cero; lo que
parece memoria es contexto reinyectado en cada petición
(`assistant.service.ts`, `history.slice(-6)`). "Que aprenda por su cuenta" no es
una función que se active: es una arquitectura que se construye.

Se construye en tres capas, y cada una es verificable:

### Capa 1 — Modelo predictivo de riesgo académico (ML supervisado real)

Hoy `domains/risk/risk.service.ts` clasifica con **umbrales escritos a mano**
(3.0 de nota, 70% de asistencia). No aprende de nada.

Se sustituye por un modelo entrenado con el histórico de la institución:

- **Servicio**: `ml_service/` — Python + FastAPI + scikit-learn.
- **Objetivo**: probabilidad de que un estudiante repruebe o deserte.
- **Variables**: notas por corte, tendencia entre cortes, % de asistencia, racha de faltas, entregas tardías, comparación contra la media del grupo, histórico del estudiante.
- **Modelo**: Gradient Boosting (`HistGradientBoostingClassifier`) como línea base; regresión logística como referencia interpretable.
- **Explicabilidad**: SHAP. La alerta nunca dice solo "riesgo alto": dice **por qué** y **cuánto pesó cada factor**. Requisito ético, no adorno.
- **Fallback**: si el servicio ML no responde, el backend cae a las reglas actuales. La app nunca se queda sin predicción.

> Python vuelve al proyecto — pero por la puerta correcta. Era la herramienta
> equivocada para la interfaz y es la correcta para el modelado.

### Capa 2 — Aprendizaje continuo (el "aprendizaje propio")

Un modelo que no recibe realimentación no aprende. El ciclo:

```
Predicción ──► el docente marca ¿acertó? (sí / no)
     │                     │
     │                     ▼
     │            Se guarda como etiqueta
     │                     │
     ▼                     ▼
Cierre de semestre ──► resultado real (aprobó / reprobó)
                           │
                           ▼
                   Reentrenamiento programado
                           │
                           ▼
              Validación: ¿la versión nueva supera a la anterior?
                     sí ──► se promueve    no ──► se descarta
```

- Registro de versiones de modelo con sus métricas (precisión, recall, AUC).
- Ninguna versión se promueve sin superar a la vigente en validación cruzada.
- Métricas visibles en la app: el docente ve qué tan confiable es el modelo.

Eso es aprendizaje medible. Sin este ciclo, "IA que aprende" es solo una frase.

### Capa 3 — Memoria del asistente (RAG)

Para que el chat recuerde entre sesiones:

- Embeddings locales vía Ollama (`nomic-embed-text`), almacenados en MongoDB Atlas Vector Search.
- Se indexan: conversaciones previas, notas del docente, histórico académico.
- En cada consulta se recuperan los fragmentos relevantes y se inyectan como contexto.
- Cero datos hacia la nube: todo el pipeline es local.

---

## 6. Seguridad

| Problema (V1) | Solución (V2) |
|---|---|
| Credenciales quemadas en `login_window.py:69` | Eliminadas. Sin valores por defecto en producción. |
| Tokens en QSettings (registro en texto plano) | Llavero del SO vía `keyring` de Rust (DPAPI en Windows, Keychain en macOS). |
| `refresh_token` guardado y nunca usado | Interceptor con renovación automática ante 401 y una sola petición en vuelo. |
| 20 `except Exception` tragando errores | `Result<T, E>` tipado + Error Boundary + toasts con mensaje accionable. |
| URLs quemadas en 4 archivos | `core/config/env.ts`, tipada y validada al arrancar. |
| Sin control de permisos en el cliente | `permissions.ts` + guardas de ruta según el rol del JWT. |
| Superficie nativa abierta | Allowlist de capacidades de Tauri: solo lo que se usa. |

---

## 7. Rendimiento — objetivos medibles

| Métrica | V1 (PySide6) | Objetivo V2 |
|---|---|---|
| Arranque hasta interactivo | ~3–6 s (9 páginas + 5 peticiones bloqueantes) | < 800 ms |
| Cambio de página | Sincrónico, con bloqueo | < 100 ms (carga diferida + caché) |
| RAM en reposo | ~180 MB | < 90 MB |
| Tamaño del instalador | ~120 MB | < 15 MB |
| Lista de 1.000 estudiantes | Se congela | 60 fps (virtualización) |

Técnicas: carga diferida por ruta, virtualización con TanStack Virtual, caché
con `staleTime`, actualizaciones optimistas, invalidación selectiva por evento
de socket, y skeletons en vez de pantallas en blanco.

---

## 8. Plan de fases

| Fase | Contenido | Verificación |
|---|---|---|
| 1 | Auditoría | ✅ Completada |
| 2 | Arquitectura | ✅ Este documento |
| 3 | Andamiaje Tauri + sistema de diseño | ✅ Build verde, tokens y tema claro/oscuro operativos |
| 4 | Núcleo: auth, http, llavero, socket | ✅ Renovación de sesión cubierta por pruebas |
| 5 | Migración de los módulos | ✅ 11 pantallas (9 de V1 + Riesgo + Asistente separados) |
| 6 | Rendimiento | ✅ Carga diferida por ruta, virtualización, caché, ECharts diferido |
| 7 | Servicio ML + RAG | ⏳ Pendiente |
| 8 | Pruebas | 🟡 29 unitarias en verde; E2E pendiente |
| 9 | Documentación | 🟡 `desktop/README.md` + este documento; UML pendiente |

Estado del build al cierre de la Fase 6:

```
tsc --noEmit    →  sin errores
vitest run      →  29 pruebas, 4 archivos, todo en verde
vite build      →  ✓ en 9 s
```

Reparto de chunks: cada pantalla pesa entre 4 y 8 kB y se descarga solo al
navegar a ella. ECharts (524 kB) quedó fuera del arranque mediante carga
diferida, así que ninguna pantalla sin gráficos paga su costo.

Empaquetado nativo verificado en Windows 11 (Rust 1.97.1 + MSVC 14.44 + Windows
SDK 10.0.26100):

```
cargo build --release  →  ✓ en 8m 44s
uts-nexus-desktop.exe  →  4,7 MB
instalador NSIS        →  2,1 MB
instalador MSI         →  2,7 MB
arranque del binario   →  ✓ la ventana nativa abre y cierra limpio
```

El objetivo de la §7 era un instalador por debajo de 15 MB frente a los ~120 MB
del empaquetado anterior con PyInstaller. Resultado: **2,1 MB**.

**El backend y la base de datos no se tocan en ninguna fase** salvo para añadir
el proxy hacia el servicio ML y los endpoints de realimentación (Fase 7).
`desktop_python/` se conserva hasta que la Fase 5 alcance paridad funcional.
