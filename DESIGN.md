<div align="center">

# 🎨 UTS Nexus Académico — DESIGN.md

**Documento Maestro de Diseño**

`Versión 1.0` · `Estado: En desarrollo`

</div>

---

## Índice

1. [Filosofía del diseño](#1-filosofía-del-diseño)
2. [Objetivos UX](#2-objetivos-ux)
3. [Identidad visual](#3-identidad-visual)
4. [Sistema de colores](#4-sistema-de-colores)
5. [Tipografía](#5-tipografía)
6. [Iconografía](#6-iconografía)
7. [Espaciado y grid](#7-espaciado-y-grid)
8. [Componentes](#8-componentes)
9. [Layout y navegación](#9-layout-y-navegación)
10. [Dashboard](#10-dashboard)
11. [Diseño por rol](#11-diseño-por-rol)
12. [Sistema de riesgo](#12-sistema-de-riesgo)
13. [Sistema de alertas](#13-sistema-de-alertas)
14. [Tablas y gráficos](#14-tablas-y-gráficos)
15. [Accesibilidad](#15-accesibilidad)
16. [Responsive design](#16-responsive-design)
17. [Animaciones](#17-animaciones)
18. [Estados de la aplicación](#18-estados-de-la-aplicación)
19. [Inteligencia artificial](#19-inteligencia-artificial)
20. [Futuro del diseño](#20-futuro-del-diseño)

---

## 1. Filosofía del diseño

UTS Nexus Académico busca **transformar la experiencia académica** mediante una
interfaz moderna, intuitiva y orientada a la **toma de decisiones**.

La plataforma no pretende ser únicamente un sistema de notas, sino un **centro
inteligente para el seguimiento académico**.

**Reglas rectoras:**
- El usuario nunca debe sentirse perdido.
- Toda información importante debe encontrarse en **menos de tres clics**.

---

## 2. Objetivos UX

### Simplicidad
- Eliminar procesos repetitivos.
- Reducir clics y formularios largos.
- Automatizar cálculos.

### Claridad
Cada pantalla debe responder tres preguntas:
- ¿Dónde estoy?
- ¿Qué información veo?
- ¿Qué puedo hacer?

### Velocidad
- Todo debe cargar rápidamente.
- Mostrar **Skeleton Loaders**.
- Nunca pantallas completamente blancas.

### Consistencia
- Todos los botones funcionan igual.
- Todos los colores significan lo mismo.
- Todos los formularios mantienen el mismo diseño.

---

## 3. Identidad visual

**Concepto:** Tecnología + Educación + Inteligencia Artificial.

**Sensación buscada:**

| ✔ Profesional | ✔ Moderna | ✔ Limpia | ✔ Tecnológica | ✔ Cercana |
|:---:|:---:|:---:|:---:|:---:|

---

## 4. Sistema de colores

### Paleta principal

| Rol | Hex | Muestra | Uso |
|-----|-----|---------|-----|
| **Primario** | `#144D37` | 🟩 | Verde institucional UTS — color dominante, acciones principales, cabeceras |
| **Acento / Lettering** | `#CAD225` | 🟢 | Lima — acentos, resaltados, lettering (en oscuro es el color principal) |
| **Éxito** | `#16A34A` | 🟩 | Aprobado, riesgo bajo, confirmaciones |
| **Advertencia** | `#D97706` | 🟧 | Riesgo medio, seguimiento (ámbar, distinto de la lima) |
| **Peligro** | `#DC2626` | 🟥 | Riesgo alto, reprobado, errores |
| **Información** | `#0E7490` | 🟦 | Mensajes informativos, tooltips |

> **Marca UTS:** verde `#144D37` como color **dominante** y lima `#CAD225` como
> **acento / lettering**. Ambos modos (claro y oscuro) están disponibles y se
> pueden alternar desde Configuración.

### Modo oscuro — paleta oliva/lima

El modo oscuro anterior (fondo verde `#0F3D2B` + texto lima `#E9F2D3`) generaba
poco contraste tonal entre capas y saturaba la vista con lima en zonas grandes
de texto. Se reemplaza por una **escala oliva neutra** (basada en la paleta de
referencia) para las superficies, dejando el lima **exclusivamente como acento
puntual** — nunca como color de texto extenso ni de fondo.

| Rol | Hex | Muestra | Uso |
|-----|-----|---------|-----|
| **Fondo base** | `#232922` | ⬛ | Fondo general de la app (variante aún más oscura de `#33332A`, evita el "gris carbón" genérico) |
| **Superficie / Cards** | `#33332A` | ⬛ | Tarjetas, paneles, modales — un paso de elevación sobre el fondo |
| **Superficie elevada** | `#37382C` | ⬛ | Elementos flotantes: dropdowns, tooltips, popovers (elevación 2) |
| **Bordes / Divisores** | `#696B3E` | 🟫 | Bordes de inputs, separadores, líneas de tabla — usar al 100% en bordes finos o 25–35% opacidad en divisores sutiles |
| **Acento secundario** | `#999E3C` | 🟩 | Hover de botones secundarios, iconos inactivos-pero-relevantes, barras de progreso secundarias |
| **Acento primario** | `#CAD225` | 🟢 | Botón primario, link activo, tab seleccionada, foco — **uso puntual, nunca en bloques de texto** |
| **Texto principal** | `#EDEFDD` | ⬜ | Crema-lima muy suave (no lima puro) — contraste alto sin fatiga visual |
| **Texto secundario** | `#A6AA8A` | ⬜ | Descripciones, captions, metadatos |

```
/* Modo oscuro — revisado */
--dark-bg:              #232922   /* fondo base */
--dark-surface:         #33332A   /* cards / paneles (elevación 1) */
--dark-surface-raised:  #37382C   /* dropdowns / tooltips (elevación 2) */
--dark-border:          #696B3E   /* bordes y divisores */
--dark-accent-secondary:#999E3C   /* hover, iconos secundarios */
--dark-primary:         #CAD225   /* acento primario — uso puntual */
--dark-text:            #EDEFDD   /* texto principal */
--dark-text-muted:      #A6AA8A   /* texto secundario */

/* Semánticos en modo oscuro.
   Los hex de la paleta principal están calibrados para texto sobre blanco.
   Medidos sobre la superficie de card (#33332A) dan 3.9:1 (éxito), 4.0:1
   (advertencia), 2.6:1 (peligro) y 2.4:1 (información): por debajo del 4.5:1
   que exigen la regla 5 de esta sección y §15. Se usan aclarados, que conservan
   el significado (verde = éxito, rojo = peligro) y sí cumplen AA.
   Los hex originales siguen siendo válidos como relleno sólido con texto
   oscuro encima (badges, barras), donde el contraste lo aporta la letra. */
--dark-success:  #4ADE80   /* 7.3:1 sobre #33332A */
--dark-warning:  #FBBF24   /* 7.6:1 */
--dark-danger:   #F87171   /* 4.6:1 */
--dark-info:     #38BDF8   /* 6.0:1 */

/* Fondos suaves de badge en oscuro (contrapartida de los chips claros) */
--dark-success-soft: #1C3B23
--dark-warning-soft: #40320F
--dark-danger-soft:  #43201D
--dark-info-soft:    #123A44
--dark-accent-soft:  #3A3D1C
```

**Reglas de uso (para evitar sobrecarga visual):**

1. **Máximo dos tonos de lima/oliva visibles por pantalla.** Si el botón primario ya usa `--dark-primary`, los demás acentos de esa vista van en `--dark-accent-secondary` o `--dark-border`, no en lima otra vez.
2. **El lima (`#CAD225`) nunca es color de fondo de superficies grandes** (cards, sidebars, headers completos) en modo oscuro — solo botones, badges pequeños, indicadores de selección y focus rings.
3. **Jerarquía de elevación por contraste tonal, no por brillo del acento:** fondo (`#232922`) → card (`#33332A`) → elemento flotante (`#37382C`) → borde (`#696B3E`). El lima se reserva para el último nivel: interacción.
4. **Texto siempre en `--dark-text` o `--dark-text-muted`**, nunca en lima puro, para no competir visualmente con los CTAs.
5. Verificar contraste **AA** (mínimo 4.5:1 para texto body) en cada combinación antes de shippear; `--dark-text` sobre `--dark-bg` y `--dark-surface` ya cumple holgadamente.

### Neutros

| Rol | Hex | Uso |
|-----|-----|-----|
| **Fondo** | `#F8FAFC` | Fondo general de la app |
| **Cards** | `#FFFFFF` | Superficie de tarjetas y paneles |
| **Texto principal** | `#111827` | Títulos y contenido |
| **Texto secundario** | `#6B7280` | Descripciones, captions, metadatos |

### Tokens (referencia para implementación)

```
--color-primary:      #144D37   /* verde institucional (dominante) */
--color-accent:       #CAD225   /* lima (acento / lettering) */
--color-success:      #16A34A
--color-warning:      #D97706
--color-danger:       #DC2626
--color-info:         #0E7490
--color-bg:           #F4F7F1
--color-surface:      #FFFFFF
--color-text:         #12271E
--color-text-muted:   #5B6B61

/* Modo oscuro — ver la escala oliva completa más arriba */
--dark-bg:            #232922
--dark-surface:       #33332A
--dark-text:          #EDEFDD
--dark-primary:       #CAD225   /* lima como acento principal */
```

> **Regla de semántica:** un color = un significado. El verde siempre es
> éxito/bajo riesgo, el rojo siempre es peligro/alto riesgo. Nunca reutilizar un
> color con otro significado.

---

## 5. Tipografía

**Principal:** `Inter` · **Fallback:** `Roboto`

| Nivel | Tamaño | Uso |
|-------|--------|-----|
| **H1** | 36px | Título de página |
| **H2** | 30px | Sección principal |
| **H3** | 24px | Subsección / título de card |
| **Body** | 16px | Texto general |
| **Caption** | 13px | Metadatos, etiquetas, notas al pie |

---

## 6. Iconografía

**Librerías:** Lucide · Material Symbols · Heroicons

- Todos los iconos en estilo **outline**.
- **No mezclar** más de un estilo de iconos en la misma app.

---

## 7. Espaciado y grid

- Sistema de **12 columnas**.
- **Padding general:** 24px
- **Gap:** 16px
- **Border radius de cards:** 18px

```
--space-page:    24px
--space-gap:     16px
--radius-card:   18px
```

---

## 8. Componentes

Catálogo base (todos con estados: default, hover, focus, disabled, loading):

| Formularios | Contenedores | Feedback | Navegación | Datos |
|-------------|--------------|----------|------------|-------|
| Botón primario | Card | Toast | Tabs | Data Table |
| Botón secundario | Modal | Badge | Breadcrumbs | Charts |
| Input | Dialog | Tooltip | Pagination | Progress Bar |
| Textarea | | Avatar | Search | |
| Select | | | | |
| Date Picker | | | | |

---

## 9. Layout y navegación

- Estructura clara con navegación lateral (desktop) y barra inferior (mobile).
- Migas de pan (breadcrumbs) para ubicación.
- Búsqueda global accesible.

---

## 10. Dashboard

La pantalla principal debe responder cuatro preguntas:

1. ¿Cómo van mis estudiantes?
2. ¿Quién necesita ayuda?
3. ¿Qué materias presentan mayor riesgo?
4. ¿Qué debo hacer hoy?

**Componentes:** Resumen general · Materias · Grupos · Riesgo · Asistencia ·
Actividad reciente · Notificaciones · Calendario.

---

## 11. Diseño por rol

### 👨‍🏫 Dashboard Docente

| Widget | |
|--------|--|
| 📈 Promedio general | 📅 Próximas clases |
| 👨‍🎓 Total estudiantes | 📊 Evolución por corte |
| ⚠️ Riesgo alto | 🟡 Riesgo medio |
| 🟢 Riesgo bajo | |

### 🎓 Dashboard Estudiante

Promedio · Porcentaje para aprobar · Asistencia · Notas · Próximas evaluaciones ·
Calendario · **Predicción de nota** · **Recomendaciones IA**.

### 🛠️ Dashboard Administrador

Usuarios · Programas · Materias · Reportes · Estadísticas · Facultades · Logs ·
Respaldos.

---

## 12. Sistema de riesgo

| Color | Nivel | Significado |
|:-----:|-------|-------------|
| 🟢 Verde | Sin riesgo | Todo en orden |
| 🟡 Amarillo | Necesita seguimiento | Vigilar de cerca |
| 🔴 Rojo | Intervención inmediata | Actuar ya |

**Regla de oro:** cada riesgo debe **explicar el motivo**. Nunca mostrar
únicamente un color.

> **Ejemplo correcto:**
> 🔴 **Riesgo Alto** — *"Asistencia del 42% y promedio de 2.1"*

---

## 13. Sistema de alertas

**No** usar ventanas emergentes invasivas.

**Preferir:** Toast · Banner · Notificación lateral.

---

## 14. Tablas y gráficos

### Tablas — deben incluir:
Buscar · Ordenar · Filtrar · Exportar · Columnas configurables · Paginación.

### Gráficos disponibles:
Bar Chart · Radar · Pie · Area · Heatmap · Timeline · Predicción.

> Todos los gráficos usan **colores institucionales** (ver §4).

---

## 15. Accesibilidad

- Modo oscuro y modo claro.
- Contraste **AA** mínimo.
- Navegación completa con teclado.
- Compatibilidad con lectores de pantalla (Screen Readers).
- Etiquetas **ARIA**.
- Tamaño de fuente configurable.

---

## 16. Responsive design

| Categoría | Resoluciones |
|-----------|--------------|
| Desktop | 1920 · 1600 · 1440 · 1366 |
| Laptop | — |
| Tablet | — |
| Mobile | — |

> **Regla:** nunca ocultar información importante al reducir la pantalla;
> reorganizar, no eliminar.

---

## 17. Animaciones

- **Duración:** 200 ms
- **Curva:** `ease-out`
- No abusar de animaciones. Priorizar la **fluidez**.

---

## 18. Estados de la aplicación

Toda vista debe contemplar sus estados:

`Loading (Skeleton)` · `Empty` · `Sin datos` · `Error` · `Actualizando` ·
`Offline / Sin conexión`.

---

## 19. Inteligencia artificial

Las recomendaciones de IA **siempre deben explicar el motivo**.

> **Ejemplo:**
> *"El estudiante tiene 65% de asistencia y un promedio de 2.8. Se recomienda
> programar tutorías."*

En UTS Nexus Académico la IA es **local (Ollama)** y usa los datos académicos
reales del docente como contexto. Coherente con la §12: nunca un veredicto sin
su justificación.

---

## 20. Futuro del diseño

- Sistema de temas personalizable por facultad.
- Componentes reutilizables documentados (design system vivo).
- Métricas de uso para iterar sobre las pantallas más visitadas.
- Modo de alto contraste y accesibilidad avanzada.

---

<div align="center">

**UTS Nexus Académico** · Documento Maestro de Diseño v1.0

</div>
