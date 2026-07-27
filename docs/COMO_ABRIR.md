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

> La app de escritorio intenta levantar el backend automáticamente si encuentra
> `backend/dist/server.js`. Aun así, se recomienda arrancarlo con `iniciar.ps1`
> la primera vez (compila, siembra datos de demo y valida).

---

## 1. App de PC (Escritorio) 🖥️

### Opción fácil — doble clic

Haz **doble clic en `abrir_pc.bat`** (está en la raíz del proyecto).

- Si existe el ejecutable compilado, se abre al instante.
- Si no, el script crea un entorno virtual de Python, instala lo necesario y
  abre la app. La primera vez tarda unos minutos; las siguientes son inmediatas.

### Opción manual (desde código)

```powershell
cd desktop_python
pip install -r requirements.txt
python main.py
```

### Iniciar sesión

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@uts.edu.co` | `Uts12345!` |
| Docente | `docente@uts.edu.co` | `Uts12345!` |

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
| **PC (escritorio)** | Doble clic en `abrir_pc.bat` |
| **Android en Android Studio** | Doble clic en `abrir_android.bat` → opción **1** |
| **Android directo en dispositivo** | Doble clic en `abrir_android.bat` → opción **2** |
| **APK para instalar en un teléfono** | Doble clic en `abrir_android.bat` → opción **3** |

Credenciales de demo (todas con contraseña `Uts12345!`):
`admin@uts.edu.co` · `docente@uts.edu.co` · `estudiante@uts.edu.co`
