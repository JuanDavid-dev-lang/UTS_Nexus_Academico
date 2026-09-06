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

    // En Linux hay que lanzar `xdg-open` a mano en vez de dejárselo a `opener`.
    // No es por gusto: `opener` no deja tocar el entorno del proceso que crea, y
    // dentro de una AppImage ese entorno lleva el `LD_LIBRARY_PATH` de la
    // imagen. El gestor de archivos arranca con las librerías equivocadas y no
    // abre nada, o abre y se cae — y el usuario solo ve que el botón «abrir
    // carpeta» no hace nada.
    //
    // Si `xdg-open` no está instalado se cae a `opener`, que sabe probar otros
    // caminos: fuera de una AppImage su entorno es correcto de todas formas.
    #[cfg(target_os = "linux")]
    {
        let mut comando = std::process::Command::new("xdg-open");
        comando.arg(&directory);
        crate::entorno::limpiar_para_hijo(&mut comando);

        if comando.spawn().is_ok() {
            return Ok(());
        }
    }

    opener::open(directory).map_err(|err| format!("No se pudo abrir la carpeta: {err}"))
}

/// En qué formato está instalada la aplicación.
///
/// Lo pregunta Configuración para poder avisar de lo que va a pasar al
/// actualizar, que en Linux **no es lo mismo según el formato**: una AppImage se
/// reemplaza a sí misma sin permisos, mientras que un `.deb` o un `.rpm`
/// instalan en `/usr` y el sistema pide autorización de administrador. Quien no
/// lo espera lee ese diálogo de contraseña como un fallo de la aplicación y
/// cancela.
///
/// El dato lo da la propia biblioteca de Tauri —la misma función que usa el
/// actualizador para elegir qué descargar—, así que no puede discrepar de lo que
/// el actualizador acabe haciendo. Deducirlo aquí por nuestra cuenta sí podría.
#[tauri::command]
pub fn installed_package_format() -> String {
    match tauri::utils::platform::bundle_type() {
        Some(tipo) => format!("{tipo:?}").to_lowercase(),
        None => "desconocido".into(),
    }
}
