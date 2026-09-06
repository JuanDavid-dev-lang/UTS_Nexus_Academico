//! Dos cosas que solo Linux necesita, y que sin ellas fallan en silencio.
//!
//! No son comandos: nadie los invoca desde la interfaz. Son ajustes del proceso
//! —el entorno con el que arranca la ventana, y el que heredan los procesos que
//! la aplicación lanza— que tienen que estar puestos antes de que haya nada que
//! invocar.
//!
//! En Windows y macOS todo lo de aquí es un no-op compilado a nada.

#[cfg(target_os = "linux")]
use std::path::Path;
use std::process::Command;

/// Variables que una AppImage inyecta y que ningún proceso hijo debe heredar.
///
/// `AppRun` las apunta a las librerías empaquetadas dentro de la imagen. Eso es
/// correcto para la aplicación y **veneno para cualquier otra cosa**: `node` y
/// `xdg-open` acaban cargando la `libssl` o la `libglib` de la AppImage en vez
/// de las suyas, y revientan con un error de símbolo indefinido que no menciona
/// la palabra AppImage por ninguna parte. Quien lo lea buscará el fallo en Node.
///
/// `XDG_DATA_DIRS` **no** está en la lista a propósito: `AppRun` le antepone su
/// directorio pero conserva los del sistema, y quitarla dejaría a `xdg-open`
/// sin saber qué aplicación abre una carpeta.
#[cfg(target_os = "linux")]
const VARIABLES_DE_APPIMAGE: [&str; 11] = [
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "GIO_MODULE_DIR",
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_PIXBUF_MODULEDIR",
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "GTK_DATA_PREFIX",
    "GSETTINGS_SCHEMA_DIR",
    "GST_PLUGIN_SYSTEM_PATH",
    "QT_PLUGIN_PATH",
];

/// Deja a un proceso hijo con el entorno del sistema, no con el de la AppImage.
///
/// Se restaura el valor original cuando `AppRun` lo guardó en `<VAR>_ORIG` —lo
/// hacen las AppImages construidas con `linuxdeploy`— y se borra la variable
/// cuando no lo hizo. Borrar es lo correcto por defecto: la alternativa sería
/// adivinar un valor, y una `LD_LIBRARY_PATH` inventada es peor que ninguna.
///
/// Fuera de una AppImage no toca nada. La condición es `APPDIR`, que es la
/// variable que la propia imagen define; comprobar el nombre del ejecutable
/// fallaría con la imagen ya extraída a mano, que es una forma legítima de
/// ejecutarla en las distribuciones sin FUSE 2.
pub fn limpiar_para_hijo(comando: &mut Command) {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("APPDIR").is_none() {
            return;
        }

        for variable in VARIABLES_DE_APPIMAGE {
            match std::env::var_os(format!("{variable}_ORIG")) {
                Some(original) => {
                    comando.env(variable, original);
                }
                None => {
                    comando.env_remove(variable);
                }
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    let _ = comando;
}

/// Evita la ventana en blanco de WebKitGTK con el driver propietario de NVIDIA.
///
/// Es el fallo número uno de Tauri en Linux y no produce ningún error: la
/// ventana abre, el marco se dibuja, y dentro no hay nada. Quien lo sufre no
/// tiene forma de relacionarlo con su tarjeta gráfica.
///
/// Se detecta el driver en lugar de apagar el renderizador siempre porque
/// apagarlo cuesta la ruta de render acelerada, y la inmensa mayoría de los
/// equipos —Intel, AMD, o NVIDIA con nouveau— no tienen el problema. Solo el
/// módulo propietario lo tiene, y solo él deja `/sys/module/nvidia`.
///
/// Una variable puesta desde fuera manda sobre la detección: es la vía de
/// escape para el caso que no se previó aquí, y quitarla obligaría a recompilar
/// para diagnosticar.
pub fn preparar_render_grafico() {
    #[cfg(target_os = "linux")]
    {
        const VARIABLE: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

        if std::env::var_os(VARIABLE).is_some() {
            return;
        }
        if !Path::new("/sys/module/nvidia").exists() {
            return;
        }

        std::env::set_var(VARIABLE, "1");
    }
}
