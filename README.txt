======================================================================
  UTS NEXUS ACADÉMICO
  Plataforma académica unificada — Universidad de Santander (UTS)
======================================================================

Una sola plataforma, tres aplicaciones que hablan con un backend central
y una base de datos en la nube (MongoDB Atlas):

  * Backend central   -> Node.js + Express + TypeScript    (carpeta: backend)
  * App de escritorio -> Tauri 2 + React 19 (admin/docente) (carpeta: desktop)
  * App móvil         -> Flutter (docente/estudiante)       (carpeta: flutter_app)
  * Base de datos     -> MongoDB Atlas (solo se accede vía backend)

  La app de escritorio v1 (Python + PySide6, carpeta desktop_python) sigue en
  el repositorio pero está EN DESUSO. Se conserva como referencia hasta que la
  v2 esté validada; ya no recibe funcionalidades nuevas.

El backend es la ÚNICA fuente de verdad: calcula notas, asistencia y riesgo.
Ni el escritorio ni el móvil recalculan nada; solo muestran lo que el
backend entrega. Así no se duplica la lógica.


----------------------------------------------------------------------
REQUISITOS
----------------------------------------------------------------------
  - Node.js 20 o superior
  - Una cuenta/cluster de MongoDB Atlas (cadena de conexión)
  - Para COMPILAR el escritorio: Rust (rustup) + Visual Studio Build Tools con
    el workload de C++. Solo hace falta la primera vez:
        winget install Rustlang.Rustup
        winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override
          "--wait --passive --norestart
           --add Microsoft.VisualStudio.Workload.VCTools
           --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64
           --add Microsoft.VisualStudio.Component.Windows11SDK.22621
           --includeRecommended"
  - Para USAR el escritorio ya compilado: nada, solo el .exe.
  - Para el móvil: Flutter SDK (solo si vas a compilar la app Android)


----------------------------------------------------------------------
ARRANQUE RÁPIDO (backend + datos demo + prueba automática)
----------------------------------------------------------------------
1) Configura la base de datos:
     - Copia  backend/.env.example  a  backend/.env
     - Edita backend/.env y pon tu MONGODB_URI de Atlas.

   IMPORTANTE - nombres exactos de las variables (backend/src/shared/env.ts):
     MONGODB_URI          <- obligatoria; sin ella no hay base de datos
     JWT_ACCESS_SECRET    <- OJO: es JWT_ACCESS_SECRET, NO "JWT_SECRET"
     JWT_REFRESH_SECRET
     CLIENT_ORIGIN=*      <- necesario para que la app de escritorio conecte
     PORT=4000

   Un nombre mal escrito NO da error: el backend usa el valor por defecto
   en silencio (por ejemplo, firma los tokens con el secreto "dev-access").

   Sobre CLIENT_ORIGIN: la app de escritorio no se sirve desde localhost
   (su origen es http://tauri.localhost). Si CLIENT_ORIGIN apunta a un puerto
   concreto, el login fallará con un error que dice "sin conexión" y no
   menciona CORS. En local, deja CLIENT_ORIGIN=*

   OJO: el backend escucha en TODAS las interfaces (0.0.0.0), no solo en
   127.0.0.1. Eso es lo que permite que el teléfono se conecte, pero también
   lo hace visible para cualquiera en la misma red Wi-Fi. Todos los endpoints
   exigen JWT, pero no lo expongas en una red pública sin cortafuegos.
   Compruébalo con:  netstat -ano | findstr :4000

2) Ejecuta el arranque automático:

   WINDOWS (PowerShell):
     powershell -ExecutionPolicy Bypass -File .\iniciar.ps1

   LINUX / MAC / GIT BASH:
     ./iniciar.sh

   Esto instala dependencias, compila, siembra datos de demo, levanta el
   backend y corre un "smoke test" que valida los endpoints principales.

3) Verás la API en:   http://localhost:4000
   Documentación:      http://localhost:4000/docs   (Swagger)


----------------------------------------------------------------------
CREDENCIALES DE DEMO (tras el seed)
----------------------------------------------------------------------
  Administrador : admin@uts.edu.co        / (la que genere el seed)
  Coordinación  : coordinador@uts.edu.co  / (la que genere el seed)
  Docente       : docente@uts.edu.co      / (la que genere el seed)
  Estudiante    : estudiante@uts.edu.co   / (la que genere el seed)


----------------------------------------------------------------------
ARRANCAR CADA APLICACIÓN
----------------------------------------------------------------------
BACKEND (manual, sin el script):
    cd backend
    npm install
    npm run build
    npm run seed        (solo la primera vez / para reiniciar datos demo)
    npm start           (o "npm run dev" para desarrollo con recarga)

ESCRITORIO (Tauri + React) — LA FORMA FÁCIL:
    Doble clic en  abrir_escritorio.bat
    -> Compila lo que falte, abre la aplicación y listo.

ESCRITORIO — manual:
    cd desktop
    npm install
    npm run desktop:build     (ejecutable + instaladores; ~10 min la 1a vez)
    npm run desktop:dev       (ventana nativa con recarga en caliente)
    npm run dev               (solo la interfaz en el navegador, sin Rust)

    Una vez compilado queda en:
      desktop\src-tauri\target\release\uts-nexus-desktop.exe          (4,7 MB)
      desktop\src-tauri\target\release\bundle\nsis\*-setup.exe        (2,1 MB)
      desktop\src-tauri\target\release\bundle\msi\*.msi               (2,7 MB)

    -> Inicia sesión con las credenciales de docente o admin.
    -> La app arranca el backend por su cuenta si ya está compilado.
    -> Tus tokens se guardan cifrados en el llavero de Windows.

    Atajos:  Ctrl+K busqueda global · Ctrl+B menú · Ctrl+Shift+L tema

ESCRITORIO v1 (Python, en desuso):
    Doble clic en  abrir_pc.bat
    o bien:
      cd desktop_python
      pip install -r requirements.txt
      python main.py

MÓVIL (Flutter):
    cd flutter_app
    flutter pub get
    flutter run
    -> En emulador Android la API se resuelve en http://10.0.2.2:4000
    -> Inicia sesión como docente o como estudiante.


----------------------------------------------------------------------
COMANDOS ÚTILES DEL BACKEND
----------------------------------------------------------------------
  npm run check:env            Verifica el .env (sin imprimir secretos).
  npm run seed                 Crea/actualiza datos de demo.
  npm run smoke                Prueba los endpoints (servidor debe estar arriba).
  npm run migrate:enrollments  Migra datos viejos a la colección Matrículas.
  npm run build                Compila TypeScript.
  npm start                    Arranca el servidor compilado.


----------------------------------------------------------------------
COMANDOS ÚTILES DEL ESCRITORIO (desde /desktop)
----------------------------------------------------------------------
  npm run dev              Interfaz en el navegador (no requiere Rust).
  npm run desktop:dev      Ventana nativa con recarga en caliente.
  npm run desktop:build    Ejecutable + instaladores NSIS y MSI.
  npm run typecheck        Verificación de tipos.
  npm test                 Pruebas unitarias (29 en verde).


----------------------------------------------------------------------
NOTIFICACIONES DE RIESGO AUTOMÁTICAS (opcional)
----------------------------------------------------------------------
  En backend/.env pon:   RISK_SCAN_INTERVAL_MIN=30
  (0 = desactivado). También puedes dispararlo a mano desde la app de
  escritorio con el botón "Escanear riesgo".


----------------------------------------------------------------------
DOCUMENTACIÓN
----------------------------------------------------------------------
  docs/COMO_ABRIR.md       Cómo abrir cada aplicación, paso a paso.
  desktop/README.md        Cliente de escritorio v2: requisitos y comandos.
  docs/ARQUITECTURA_V2.md  Auditoría de la v1 y arquitectura de la v2.
  DESIGN.md                Sistema de diseño: paleta, tipografía, componentes.
  docs/FUNCIONAMIENTO.md   Cómo funciona la plataforma (guía de uso).
  docs/REFACTOR.md         Arquitectura, modelo de datos y plan de migración.
  docs/                    Notas de arquitectura, API, base de datos, etc.

======================================================================
