mod commands;

use tauri::Manager;

/// Builds and runs the Tauri application.
///
/// The window starts hidden and is only shown once the WebView has painted the
/// first frame. This removes the white flash that a naive setup produces.
pub fn run() {
    tauri::Builder::default()
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
            commands::backend::backend_health,
            commands::backend::backend_ensure_running,
            commands::files::save_download,
            commands::files::reveal_in_file_manager,
        ])
        .run(tauri::generate_context!())
        .expect("error while running UTS Nexus Academico");
}
