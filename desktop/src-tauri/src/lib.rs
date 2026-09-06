/// Respaldo del almacén de credenciales. Solo existe en Linux, que es el único
/// sistema donde el llavero puede no estar instalado.
#[cfg(target_os = "linux")]
mod almacen_linux;
mod commands;
mod entorno;

use tauri::Manager;

/// Builds and runs the Tauri application.
///
/// The window starts hidden and is only shown once the WebView has painted the
/// first frame. This removes the white flash that a naive setup produces.
pub fn run() {
    // Antes de que se inicialice GTK: si se pone después, WebKit ya decidió su
    // renderizador y la ventana sale en blanco igual.
    entorno::preparar_render_grafico();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Avisos nativos del escritorio: un recordatorio de clase tiene que
        // verse con la ventana detrás de otra aplicación, que es cuando sirve.
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running UTS Nexus Academico");
}
