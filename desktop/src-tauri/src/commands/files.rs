//! Writing exported reports (PDF / Excel) to the user's Downloads folder.
//!
//! Deliberately narrow: the renderer cannot choose an arbitrary path, only a
//! file name inside Downloads. That keeps the native surface small while still
//! giving the user a predictable place to find exports.

use std::path::PathBuf;

/// Strips any directory component so the renderer cannot escape Downloads
/// through `../` or an absolute path.
fn sanitize_file_name(raw: &str) -> Result<String, String> {
    let name = PathBuf::from(raw)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "Nombre de archivo inválido.".to_string())?;

    if name.is_empty() || name == "." || name == ".." {
        return Err("Nombre de archivo inválido.".into());
    }
    Ok(name)
}

/// Appends " (2)", " (3)"… instead of silently overwriting an existing export.
fn unique_path(directory: &PathBuf, file_name: &str) -> PathBuf {
    let candidate = directory.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = PathBuf::from(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("archivo")
        .to_owned();
    let extension = PathBuf::from(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    for index in 2..1000 {
        let next = directory.join(format!("{stem} ({index}){extension}"));
        if !next.exists() {
            return next;
        }
    }
    candidate
}

#[tauri::command]
pub fn save_download(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let name = sanitize_file_name(&file_name)?;
    let directory = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "No se pudo ubicar la carpeta de descargas.".to_string())?;

    std::fs::create_dir_all(&directory)
        .map_err(|err| format!("No se pudo preparar la carpeta de descargas: {err}"))?;

    let target = unique_path(&directory, &name);
    std::fs::write(&target, bytes)
        .map_err(|err| format!("No se pudo guardar el archivo: {err}"))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let directory = if target.is_dir() {
        target
    } else {
        target
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| "Ruta inválida.".to_string())?
    };

    opener::open(directory).map_err(|err| format!("No se pudo abrir la carpeta: {err}"))
}
