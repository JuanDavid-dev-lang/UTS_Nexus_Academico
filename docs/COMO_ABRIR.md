# Cómo abrir UTS Nexus Académico

Guía práctica para abrir las dos aplicaciones: la de **PC (escritorio)** y la de
**Android (Flutter)**. Ambas se conectan al mismo **backend**, así que primero
asegúrate de tener el backend corriendo.

---

## 0. Antes de empezar: levantar el backend

Las apps son solo interfaces; los datos viven en el backend. Arráncalo una vez:

```powershell
# En la raíz del proyecto
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Cuando veas `API: http://localhost:4000` el backend está listo.

> La app de escritorio levanta el backend **por su cuenta** si encuentra
> `backend/dist/server.js`. Aun así, conviene arrancarlo con `iniciar.ps1` la
> primera vez, porque además compila, siembra los datos de demo y valida que
> todo responda.

---

## 1. App de PC (Escritorio) 🖥️

Es una aplicación **nativa de Windows**: ventana propia, icono en el menú de
inicio, entrada en la barra de tareas. No se abre en el navegador.

### Opción fácil — doble clic

Haz **doble clic en `abrir_escritorio.bat`** (está en la raíz del proyecto).

El script se encarga de todo:
1. Compila el backend si aún no lo está.
2. Abre el ejecutable si ya existe.
3. Si no existe, lo compila y lo abre (la primera vez tarda ~10 minutos).

### Opción instalada — para usarla todos los días

Si vas a usarla a diario, instálala como cualquier otro programa:

```
desktop\src-tauri\target\release\bundle\nsis\UTS Nexus Académico_2.0.0_x64-setup.exe
```

Doble clic, siguiente, listo. Queda en el menú de inicio con su icono y su
desinstalador. Pesa 2,1 MB.

> ¿No existe esa carpeta? Todavía no has compilado. Usa `abrir_escritorio.bat`
> una vez y se genera sola.

### Opción portable — sin instalar

```
desktop\src-tauri\target\release\uts-nexus-desktop.exe
```

Doble clic y abre. Puedes copiar ese archivo a una memoria USB.

### Opción desarrollador — compilar a mano

```powershell
cd desktop
npm install
npm run desktop:build     # ejecutable + instaladores
npm run desktop:dev       # ventana nativa con recarga en caliente
npm run dev               # solo la interfaz, en el navegador (sin Rust)
```

**Requisitos para compilar** (solo la primera vez):

```powershell
winget install Rustlang.Rustup
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override `
  "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"
```

> **Ojo con winget.** Puede responder «already installed» sin haber instalado
> nada, porque consulta el registro de programas de Windows y no lo que Visual
> Studio realmente tiene. Comprueba de verdad con:
>
> ```powershell
> & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" `
>   -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
> ```
>
> Si no devuelve una ruta, falta el compilador de C++: reinstala con `--force`.

### Iniciar sesión

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@uts.edu.co` | `(la que genere el seed)` |
| Docente | `docente@uts.edu.co` | `(la que genere el seed)` |

La primera vez, la pantalla de acceso comprueba sola si el servidor responde y
te lo dice con una etiqueta verde («En línea») o roja («Sin conexión»). Si sale
roja, despliega **Servidor** y verifica la dirección.

Tu sesión se guarda cifrada en el llavero de Windows, así que no tendrás que
volver a escribir la contraseña cada vez.

### Atajos útiles

| Atajo | Acción |
|-------|--------|
| `Ctrl K` | Búsqueda global: estudiantes, materias y acciones |
| `Ctrl B` | Contraer / expandir el menú lateral |
| `Ctrl ⇧ L` | Cambiar tema: claro → oscuro → automático |
| `Ctrl 1…7` | Saltar directo a una sección |

<details>
<summary>Versión anterior en Python (en desuso)</summary>

`abrir_pc.bat` sigue abriendo la app v1 hecha con PySide6. Se conserva como
referencia mientras se valida la v2, pero ya no recibe funcionalidades nuevas.

```powershell
cd desktop_python
pip install -r requirements.txt
python main.py
```

</details>

---

## 2. App de Android (Flutter) en Android Studio 📱

### Requisitos previos

- **Android Studio** instalado (incluye el SDK de Android).
- **Flutter SDK** instalado y en el PATH → comprueba con `flutter doctor`.
- Un **emulador** creado en Android Studio **o** un teléfono conectado por USB
  con *Depuración USB* activada.

### Opción fácil — doble clic

Haz **doble clic en `abrir_android.bat`** (raíz del proyecto). Descarga las
dependencias y te ofrece un menú:

```
[1] Abrir el proyecto en Android Studio
[2] Ejecutar en emulador / teléfono conectado
[3] Generar APK instalable (release)
[4] Salir
```

### Opción manual — abrir en Android Studio paso a paso

1. Abre **Android Studio**.
2. `File ▸ Open…` y selecciona la carpeta **`flutter_app`** (no la raíz del
   proyecto, sino la subcarpeta `flutter_app`).
3. Espera a que **Gradle sincronice** (barra de progreso abajo).
4. Arriba, en la barra de herramientas, elige un **dispositivo** (emulador o tu
   teléfono) en el desplegable.
5. Pulsa el botón **Run ▶** (verde). La app se compila e instala.

### Ejecutar desde la terminal (alternativa)

```powershell
cd flutter_app
flutter pub get
flutter run
```

---

## 3. Muy importante: ¿a qué backend se conecta el móvil?

La URL del backend depende de **dónde** corre la app Android:

| Escenario | URL que usa | ¿Hay que configurar algo? |
|-----------|-------------|---------------------------|
| **Emulador** de Android Studio (misma PC) | `http://10.0.2.2:4000` | No, es automático |
| **Teléfono físico** en la misma red WiFi | `http://IP_DE_TU_PC:4000` | **Sí** — ver abajo |

### Configurar la IP en un teléfono real

`10.0.2.2` solo funciona en el emulador. En un teléfono físico:

1. Averigua la IP de tu PC en la red local:
   ```powershell
   ipconfig
   ```
   Busca *Dirección IPv4*, por ejemplo `192.168.1.20`.
2. Asegúrate de que el PC y el teléfono estén en la **misma red WiFi**.
3. En la app Android, en la pantalla de **login** (o en **Ajustes ⚙️**), escribe:
   ```
   http://192.168.1.20:4000
   ```
   (reemplaza por tu IP real).

> El backend permite tráfico HTTP en texto plano (`usesCleartextTraffic="true"`),
> así que no necesitas HTTPS en la red local.

### Si el firewall bloquea la conexión

La primera vez que el backend recibe una conexión externa, Windows puede pedir
permiso. Permite el acceso en **redes privadas** para que el teléfono pueda
conectarse.

---

## 4. Resumen rápido

| Quiero abrir… | Haz esto |
|---------------|----------|
| **PC (escritorio)** | Doble clic en `abrir_escritorio.bat` |
| **PC — instalarla de verdad** | Ejecuta el instalador en `desktop\src-tauri\target\release\bundle\nsis\` |
| **PC — solo la interfaz, sin compilar Rust** | `cd desktop` y `npm run dev` |
| **Android en Android Studio** | Doble clic en `abrir_android.bat` → opción **1** |
| **Android directo en dispositivo** | Doble clic en `abrir_android.bat` → opción **2** |
| **APK para instalar en un teléfono** | Doble clic en `abrir_android.bat` → opción **3** |
| **PC — versión antigua en Python** | Doble clic en `abrir_pc.bat` |

Credenciales de demo (todas con contraseña `(la que genere el seed)`):
`admin@uts.edu.co` · `docente@uts.edu.co` · `estudiante@uts.edu.co`
