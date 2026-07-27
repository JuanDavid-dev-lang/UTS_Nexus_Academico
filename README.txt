======================================================================
  UTS NEXUS ACADÉMICO
  Plataforma académica unificada — Universidad de Santander (UTS)
======================================================================

Una sola plataforma, tres aplicaciones que hablan con un backend central
y una base de datos en la nube (MongoDB Atlas):

  * Backend central   -> Node.js + Express + TypeScript  (carpeta: backend)
  * App de escritorio -> Python + PySide6  (admin/docente) (carpeta: desktop_python)
  * App móvil         -> Flutter (docente/estudiante)      (carpeta: flutter_app)
  * Base de datos     -> MongoDB Atlas (solo se accede vía backend)

El backend es la ÚNICA fuente de verdad: calcula notas, asistencia y riesgo.
Ni el escritorio ni el móvil recalculan nada; solo muestran lo que el
backend entrega. Así no se duplica la lógica.


----------------------------------------------------------------------
REQUISITOS
----------------------------------------------------------------------
  - Node.js 18 o superior (recomendado 20+)
  - Una cuenta/cluster de MongoDB Atlas (cadena de conexión)
  - Para el escritorio: Python 3.10+  (pip install -r desktop_python/requirements.txt)
  - Para el móvil: Flutter SDK (solo si vas a compilar la app Android)


----------------------------------------------------------------------
ARRANQUE RÁPIDO (backend + datos demo + prueba automática)
----------------------------------------------------------------------
1) Configura la base de datos:
     - Copia  backend/.env.example  a  backend/.env
     - Edita backend/.env y pon tu MONGODB_URI de Atlas.

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

ESCRITORIO (Python):
    cd desktop_python
    pip install -r requirements.txt
    python main.py
    -> Inicia sesión con las credenciales de docente o admin.

MÓVIL (Flutter):
    cd flutter_app
    flutter pub get
    flutter run
    -> En emulador Android la API se resuelve en http://10.0.2.2:4000
    -> Inicia sesión como docente o como estudiante.


----------------------------------------------------------------------
COMANDOS ÚTILES DEL BACKEND
----------------------------------------------------------------------
  npm run seed                 Crea/actualiza datos de demo.
  npm run smoke                Prueba los endpoints (servidor debe estar arriba).
  npm run migrate:enrollments  Migra datos viejos a la colección Matrículas.
  npm run build                Compila TypeScript.
  npm start                    Arranca el servidor compilado.


----------------------------------------------------------------------
NOTIFICACIONES DE RIESGO AUTOMÁTICAS (opcional)
----------------------------------------------------------------------
  En backend/.env pon:   RISK_SCAN_INTERVAL_MIN=30
  (0 = desactivado). También puedes dispararlo a mano desde la app de
  escritorio con el botón "Escanear riesgo".


----------------------------------------------------------------------
DOCUMENTACIÓN
----------------------------------------------------------------------
  docs/FUNCIONAMIENTO.md   Cómo funciona la plataforma (guía de uso).
  docs/REFACTOR.md         Arquitectura, modelo de datos y plan de migración.
  docs/                    Notas de arquitectura, API, base de datos, etc.

======================================================================
