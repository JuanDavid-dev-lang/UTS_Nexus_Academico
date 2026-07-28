//! Lifecycle of the bundled Node backend.
//!
//! Port of `desktop_python/services/backend_bootstrap.py`, with two fixes:
//! the health probe no longer blocks the UI thread (it runs on Tauri's async
//! runtime), and a failed start reports *why* instead of returning a bare
//! `false` that the caller could not act on.

use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

#[derive(serde::Serialize)]
pub struct BackendStatus {
    pub running: bool,
    pub started_by_app: bool,
    pub detail: String,
}

fn health_url(base: &str) -> String {
    format!("{}/health", base.trim_end_matches('/'))
}

fn probe(base: &str, timeout: Duration) -> bool {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .ok()
        .and_then(|client| client.get(health_url(base)).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

/// Locates `backend/dist/server.js` by walking up from the executable and from
/// the working directory.
///
/// The depth matters. From a release build the binary sits at
/// `<repo>/desktop/src-tauri/target/release/uts-nexus-desktop.exe`, so the
/// repository root is **five** levels above it: release → target → src-tauri →
/// desktop → repo. An earlier version stopped at four and silently never found
/// the backend, which surfaced to the user as "no response from server".
fn resolve_server_entry() -> Option<PathBuf> {
    /// release → target → src-tauri → desktop → repo, plus margin for an
    /// installed layout nested under Program Files or AppData.
    const MAX_DEPTH: usize = 7;

    let mut candidates: Vec<PathBuf> = Vec::new();

    let mut push_ancestors = |start: PathBuf| {
        for base in start.ancestors().take(MAX_DEPTH + 1) {
            candidates.push(base.join("backend").join("dist").join("server.js"));
        }
    };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push_ancestors(dir.to_path_buf());
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        push_ancestors(cwd);
    }

    candidates.into_iter().find(|path| path.exists())
}

#[tauri::command]
pub async fn backend_health(base_url: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || probe(&base_url, Duration::from_secs(2)))
        .await
        .unwrap_or(false)
}

/// Ensures the API answers on `base_url`, starting the bundled server if needed.
#[tauri::command]
pub async fn backend_ensure_running(
    base_url: String,
    timeout_seconds: u64,
) -> Result<BackendStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if probe(&base_url, Duration::from_secs(2)) {
            return Ok(BackendStatus {
                running: true,
                started_by_app: false,
                detail: "El servidor ya estaba activo.".into(),
            });
        }

        let Some(server) = resolve_server_entry() else {
            return Ok(BackendStatus {
                running: false,
                started_by_app: false,
                detail: "No se encontró backend/dist/server.js. Ejecuta `npm run build` en backend/.".into(),
            });
        };

        let working_dir = server
            .parent()
            .and_then(|dist| dist.parent())
            .ok_or_else(|| "Ruta del backend inválida.".to_string())?;

        let mut command = Command::new("node");
        command.arg(&server).current_dir(working_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        command
            .spawn()
            .map_err(|err| format!("No se pudo iniciar Node: {err}. ¿Está instalado y en el PATH?"))?;

        let deadline = Instant::now() + Duration::from_secs(timeout_seconds.clamp(1, 60));
        while Instant::now() < deadline {
            if probe(&base_url, Duration::from_secs(2)) {
                return Ok(BackendStatus {
                    running: true,
                    started_by_app: true,
                    detail: "Servidor iniciado por la aplicación.".into(),
                });
            }
            std::thread::sleep(Duration::from_millis(500));
        }

        Ok(BackendStatus {
            running: false,
            started_by_app: true,
            detail: format!("El servidor no respondió en {timeout_seconds}s."),
        })
    })
    .await
    .map_err(|err| format!("Fallo interno al verificar el backend: {err}"))?
}
