//! Inicio con Windows y segundo plano en la bandeja del sistema.
//!
//! Solo Windows. En Linux la bandeja depende de `libayatana-appindicator`,
//! que es un paquete que puede no estar instalado —como el Secret Service,
//! ver `almacen_linux`—, y un icono que no aparece deja la aplicación
//! «cerrada» sin ninguna forma de volver a abrirla ni de salir de ella. Hasta
//! que eso se resuelva con su dependencia declarada en el `.deb` y el `.rpm`,
//! fuera de Windows los comandos responden `disponible: false` y la pantalla
//! no ofrece las opciones.
//!
//! Qué pasa al cerrar la ventana lo decide `accion_al_cerrar`, pura y con
//! pruebas; el resto es cableado de Tauri.

use serde::Serialize;

#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};

/// Argumento con el que Windows lanza la aplicación al iniciar sesión: sin
/// ventana, directamente en la bandeja. Abrir una ventana de 1440×900 cada vez
/// que alguien enciende el equipo es la forma más rápida de que desactive la
/// opción.
#[cfg(windows)]
pub const ARG_SEGUNDO_PLANO: &str = "--segundo-plano";

#[derive(Debug, PartialEq, Eq)]
pub enum AccionAlCerrar {
    /// Ocultar la ventana. `avisar` solo la primera vez en esta ejecución: un
    /// aviso en cada cierre enseña a ignorarlo, y uno solo al instalar no lo
    /// ve quien no lo leyó ese día.
    Ocultar {
        avisar: bool,
    },
    Cerrar,
}

pub fn accion_al_cerrar(segundo_plano: bool, ya_avisado: bool) -> AccionAlCerrar {
    if segundo_plano {
        AccionAlCerrar::Ocultar {
            avisar: !ya_avisado,
        }
    } else {
        AccionAlCerrar::Cerrar
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AjustesSistema {
    pub disponible: bool,
    pub iniciar_con_windows: bool,
    pub segundo_plano: bool,
}

#[cfg(windows)]
pub use en_windows::*;

#[cfg(windows)]
mod en_windows {
    use super::*;
    use std::{fs, path::PathBuf};
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        AppHandle, Manager, Runtime, Window, WindowEvent,
    };
    use tauri_plugin_autostart::ManagerExt as _;
    use tauri_plugin_notification::NotificationExt as _;

    pub struct EstadoSistema {
        segundo_plano: AtomicBool,
        avisado: AtomicBool,
    }

    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Guardado {
        segundo_plano: bool,
    }

    fn ruta_ajustes<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
        app.path()
            .app_config_dir()
            .ok()
            .map(|dir| dir.join("sistema.json"))
    }

    /// Por defecto sí: es lo que se pidió, y quien no lo quiera lo apaga en
    /// Configuración. Un archivo ilegible cuenta como no guardado.
    fn leer_segundo_plano<R: Runtime>(app: &AppHandle<R>) -> bool {
        ruta_ajustes(app)
            .and_then(|ruta| fs::read_to_string(ruta).ok())
            .and_then(|texto| serde_json::from_str::<Guardado>(&texto).ok())
            .map(|g| g.segundo_plano)
            .unwrap_or(true)
    }

    fn guardar_segundo_plano<R: Runtime>(app: &AppHandle<R>, valor: bool) -> Result<(), String> {
        let ruta = ruta_ajustes(app).ok_or("No se encontró la carpeta de configuración.")?;
        if let Some(dir) = ruta.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let texto = serde_json::to_string(&Guardado {
            segundo_plano: valor,
        })
        .map_err(|e| e.to_string())?;
        fs::write(ruta, texto).map_err(|e| e.to_string())
    }

    pub fn mostrar_ventana<R: Runtime>(app: &AppHandle<R>) {
        if let Some(ventana) = app.get_webview_window("main") {
            let _ = ventana.unminimize();
            let _ = ventana.show();
            let _ = ventana.set_focus();
        }
    }

    /// Crea el icono de la bandeja y registra el estado. Devuelve si la
    /// ventana debe quedarse oculta al arrancar.
    pub fn preparar<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<bool> {
        let segundo_plano = leer_segundo_plano(app);
        app.manage(EstadoSistema {
            segundo_plano: AtomicBool::new(segundo_plano),
            avisado: AtomicBool::new(false),
        });

        let abrir = MenuItem::with_id(
            app,
            "abrir",
            "Abrir UTS Nexus Académico",
            true,
            None::<&str>,
        )?;
        let salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&abrir, &salir])?;

        let mut bandeja = TrayIconBuilder::with_id("principal")
            .tooltip("UTS Nexus Académico")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, evento| match evento.id.as_ref() {
                "abrir" => mostrar_ventana(app),
                "salir" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|bandeja, evento| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = evento
                {
                    mostrar_ventana(bandeja.app_handle());
                }
            });
        if let Some(icono) = app.default_window_icon() {
            bandeja = bandeja.icon(icono.clone());
        }
        bandeja.build(app)?;

        let lanzado_por_windows = std::env::args().any(|arg| arg == ARG_SEGUNDO_PLANO);
        Ok(lanzado_por_windows && segundo_plano)
    }

    pub fn al_evento_de_ventana<R: Runtime>(ventana: &Window<R>, evento: &WindowEvent) {
        let WindowEvent::CloseRequested { api, .. } = evento else {
            return;
        };
        let app = ventana.app_handle();
        let Some(estado) = app.try_state::<EstadoSistema>() else {
            return;
        };
        let accion = accion_al_cerrar(
            estado.segundo_plano.load(Ordering::Relaxed),
            estado.avisado.load(Ordering::Relaxed),
        );
        if let AccionAlCerrar::Ocultar { avisar } = accion {
            api.prevent_close();
            let _ = ventana.hide();
            if avisar {
                estado.avisado.store(true, Ordering::Relaxed);
                let _ = app
                    .notification()
                    .builder()
                    .title("UTS Nexus Académico sigue abierto")
                    .body(
                        "Queda en segundo plano, junto al reloj. Para cerrarlo del todo, \
                         haz clic derecho en su icono y elige «Salir».",
                    )
                    .show();
            }
        }
    }

    #[tauri::command]
    pub fn sistema_ajustes<R: Runtime>(app: AppHandle<R>) -> AjustesSistema {
        let segundo_plano = app
            .try_state::<EstadoSistema>()
            .map(|e| e.segundo_plano.load(Ordering::Relaxed))
            .unwrap_or(false);
        AjustesSistema {
            disponible: true,
            iniciar_con_windows: app.autolaunch().is_enabled().unwrap_or(false),
            segundo_plano,
        }
    }

    #[tauri::command]
    pub fn sistema_iniciar_con_windows<R: Runtime>(
        app: AppHandle<R>,
        activo: bool,
    ) -> Result<(), String> {
        let lanzador = app.autolaunch();
        let resultado = if activo {
            lanzador.enable()
        } else {
            lanzador.disable()
        };
        resultado.map_err(|e| format!("No se pudo cambiar el inicio con Windows: {e}"))
    }

    #[tauri::command]
    pub fn sistema_segundo_plano<R: Runtime>(
        app: AppHandle<R>,
        activo: bool,
    ) -> Result<(), String> {
        guardar_segundo_plano(&app, activo)?;
        if let Some(estado) = app.try_state::<EstadoSistema>() {
            estado.segundo_plano.store(activo, Ordering::Relaxed);
        }
        Ok(())
    }
}

/// Fuera de Windows: las mismas firmas, sin nada que hacer. La página pregunta
/// `disponible` y no ofrece las opciones.
#[cfg(not(windows))]
mod otros {
    use super::AjustesSistema;

    #[tauri::command]
    pub fn sistema_ajustes() -> AjustesSistema {
        AjustesSistema {
            disponible: false,
            iniciar_con_windows: false,
            segundo_plano: false,
        }
    }

    #[tauri::command]
    pub fn sistema_iniciar_con_windows(_activo: bool) -> Result<(), String> {
        Err("Solo disponible en Windows.".into())
    }

    #[tauri::command]
    pub fn sistema_segundo_plano(_activo: bool) -> Result<(), String> {
        Err("Solo disponible en Windows.".into())
    }
}

#[cfg(not(windows))]
pub use otros::*;

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn sin_segundo_plano_cierra() {
        assert_eq!(accion_al_cerrar(false, false), AccionAlCerrar::Cerrar);
        assert_eq!(accion_al_cerrar(false, true), AccionAlCerrar::Cerrar);
    }

    #[test]
    fn con_segundo_plano_oculta_y_avisa_solo_la_primera_vez() {
        assert_eq!(
            accion_al_cerrar(true, false),
            AccionAlCerrar::Ocultar { avisar: true }
        );
        assert_eq!(
            accion_al_cerrar(true, true),
            AccionAlCerrar::Ocultar { avisar: false }
        );
    }
}
