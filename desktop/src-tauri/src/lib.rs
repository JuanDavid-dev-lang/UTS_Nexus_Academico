/// Respaldo del almacén de credenciales. Solo existe en Linux, que es el único
/// sistema donde el llavero puede no estar instalado.
#[cfg(target_os = "linux")]
mod almacen_linux;
mod commands;
mod entorno;
mod segundo_plano;

use tauri::Manager;

/// Builds and runs the Tauri application.
///
/// The window starts hidden and is only shown once the WebView has painted the
/// first frame. This removes the white flash that a naive setup produces.
pub fn run() {
    // Antes de que se inicialice GTK: si se pone después, WebKit ya decidió su
    // renderizador y la ventana sale en blanco igual.
    entorno::preparar_render_grafico();

    let builder = tauri::Builder::default();

    // Tiene que ser el primer plugin: si otro se registra antes, la segunda
    // copia llega a inicializarse antes de darse cuenta de que sobra.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        segundo_plano::mostrar_ventana(app);
    }));

    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Avisos nativos del escritorio: un recordatorio de clase tiene que
        // verse con la ventana detrás de otra aplicación, que es cuando sirve.
        .plugin(tauri_plugin_notification::init());

    // Inicio con Windows: lanza la app con `--segundo-plano` para que arranque
    // en la bandeja y no con la ventana encima de todo al encender el equipo.
    #[cfg(windows)]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![segundo_plano::ARG_SEGUNDO_PLANO]),
        ))
        .on_window_event(segundo_plano::al_evento_de_ventana);

    builder
        .setup(|app| {
            #[cfg(windows)]
            let quedarse_oculta = segundo_plano::preparar(app.handle())?;
            #[cfg(not(windows))]
            let quedarse_oculta = false;

            if !quedarse_oculta {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::secure_store::secure_store_set,
            commands::secure_store::secure_store_get,
            commands::secure_store::secure_store_delete,
            commands::secure_store::secure_store_backend,
            commands::backend::backend_health,
            commands::backend::backend_ensure_running,
            commands::files::save_download,
            commands::files::reveal_in_file_manager,
            commands::files::installed_package_format,
            segundo_plano::sistema_ajustes,
            segundo_plano::sistema_iniciar_con_windows,
            segundo_plano::sistema_segundo_plano,
        ])
        .run(tauri::generate_context!())
        .expect("error while running UTS Nexus Academico");
}
