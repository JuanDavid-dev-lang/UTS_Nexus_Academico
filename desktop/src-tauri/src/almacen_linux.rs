//! Respaldo del llavero para las instalaciones de Linux que no tienen ninguno.
//!
//! En Linux los tokens van al Secret Service (gnome-keyring, KWallet), que es
//! el equivalente de DPAPI en Windows y del Llavero en macOS. La diferencia es
//! que en Windows y macOS ese servicio **siempre está**: forma parte del
//! sistema. En Linux es un paquete que puede no estar instalado, y no lo está
//! en un XFCE mínimo, en i3, en varios Debian de escritorio ni en ningún
//! entorno sin sesión gráfica completa.
//!
//! Sin respaldo, en esas máquinas guardar la sesión falla y la aplicación
//! simplemente no se puede usar. Con respaldo, funciona en cualquier
//! distribución, que es de lo que se trata.
//!
//! # Lo que este respaldo protege y lo que no
//!
//! El llavero cifra con una clave que custodia la sesión del usuario: hace
//! falta su contraseña para abrirlo. Aquí no hay tal cosa —si la hubiera, sería
//! el llavero—, así que la clave se **deriva de la máquina y del usuario**.
//! Quien pueda ejecutar código como este usuario puede derivarla igual.
//!
//! Entonces, ¿de qué sirve? De dos cosas concretas, y conviene no prometer una
//! tercera:
//!
//! 1. El archivo es `0600`, así que ningún otro usuario del equipo lo lee. Esa
//!    es la defensa real, y es la misma que protege una clave SSH.
//! 2. El contenido no es legible: una copia de seguridad, un directorio
//!    sincronizado a la nube o un disco que se va a reparar no entregan un JWT
//!    a quien lo mire. Guardar tokens en claro es justo lo que este proyecto
//!    dejó de hacer cuando abandonó QSettings.
//!
//! Lo que **no** hace es proteger frente a alguien que ya ejecuta código como
//! este usuario. Contra eso solo sirve el llavero, y por eso el llavero se
//! intenta siempre primero y la aplicación dice en Configuración cuál de los
//! dos está usando.

use std::fs;
use std::io::ErrorKind;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::PathBuf;

use chacha20poly1305::aead::{Aead, KeyInit, OsRng};
use chacha20poly1305::{AeadCore, Key, XChaCha20Poly1305, XNonce};
use sha2::{Digest, Sha256};

/// Etiqueta del derivador. Es lo que separa esta clave de cualquier otra que se
/// derivara del mismo `machine-id` para otra cosa.
const CONTEXTO: &[u8] = b"uts-nexus-academico/credenciales/v1";

/// Directorio del archivo.
///
/// `~/.local/state` y no `~/.config`: la especificación XDG reserva `state` para
/// datos que la aplicación necesita entre ejecuciones pero que **no** son
/// configuración portable. Un token de sesión no se copia a otro equipo ni entra
/// en un repositorio de dotfiles, que es exactamente lo que la gente hace con
/// `~/.config`.
fn directorio() -> Result<PathBuf, String> {
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|ruta| ruta.is_absolute())
        .or_else(|| dirs::home_dir().map(|casa| casa.join(".local").join("state")))
        .ok_or_else(|| "No se pudo ubicar el directorio de estado del usuario.".to_string())?;

    Ok(base.join("uts-nexus-academico"))
}

fn ruta_de(clave: &str) -> Result<PathBuf, String> {
    // `clave` ya viene de la lista blanca de `secure_store`, así que no puede
    // traer separadores. Se afirma igual: esta función construye una ruta a
    // partir de una cadena, y es el sitio donde un cambio futuro en la lista
    // blanca se convertiría en una escritura fuera del directorio.
    if clave.contains(['/', '\\']) || clave.contains("..") {
        return Err(format!("Clave inválida para el almacén: {clave}"));
    }
    Ok(directorio()?.join(clave))
}

/// La clave de cifrado, derivada de la máquina y del usuario.
///
/// Dos ingredientes, y cada uno responde a una cosa:
///
/// - `machine-id` es estable mientras no se reinstale el sistema y distinto en
///   cada equipo, así que copiar el archivo a otra máquina no lo hace legible
///   allí. Puede faltar —contenedores mínimos, algún sistema de arranque en
///   vivo—, y por eso no se exige.
/// - El directorio personal distingue a dos usuarios del mismo equipo. El
///   `0600` ya los separa, pero apoyar todo en una sola defensa es cómo se
///   acaba sin ninguna.
///
/// Si faltaran los dos no hay nada de donde derivar y se falla, en vez de cifrar
/// con una clave constante que sería lo mismo que no cifrar.
fn clave_de_cifrado() -> Result<Key, String> {
    let maquina = fs::read("/etc/machine-id")
        .or_else(|_| fs::read("/var/lib/dbus/machine-id"))
        .unwrap_or_default();
    let usuario = dirs::home_dir()
        .map(|casa| casa.into_os_string().into_encoded_bytes())
        .unwrap_or_default();

    if maquina.is_empty() && usuario.is_empty() {
        return Err("No se pudo derivar una clave para el almacén local.".into());
    }

    let mut hash = Sha256::new();
    hash.update(CONTEXTO);
    hash.update((maquina.len() as u64).to_le_bytes());
    hash.update(&maquina);
    hash.update(&usuario);
    Ok(*Key::from_slice(&hash.finalize()))
}

/// Guarda un valor cifrado, con el archivo creado ya en `0600`.
///
/// El modo se pasa en `OpenOptions`, no con un `set_permissions` después: entre
/// crear el archivo con el modo por omisión y corregirlo hay una ventana en la
/// que otro usuario del equipo puede abrirlo. Es corta y es real.
pub fn guardar(clave: &str, valor: &str) -> Result<(), String> {
    let carpeta = directorio()?;
    fs::create_dir_all(&carpeta).map_err(|err| format!("No se pudo crear {}: {err}", carpeta.display()))?;
    // El directorio también: un `0755` deja listar qué claves existen.
    let _ = fs::set_permissions(&carpeta, fs::Permissions::from_mode(0o700));

    let cifrador = XChaCha20Poly1305::new(&clave_de_cifrado()?);
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let cifrado = cifrador
        .encrypt(&nonce, valor.as_bytes())
        .map_err(|_| "No se pudo cifrar la credencial.".to_string())?;

    let mut contenido = nonce.to_vec();
    contenido.extend_from_slice(&cifrado);

    let ruta = ruta_de(clave)?;
    let temporal = ruta.with_extension("tmp");

    {
        use std::io::Write;
        let mut archivo = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temporal)
            .map_err(|err| format!("No se pudo abrir {}: {err}", temporal.display()))?;
        archivo
            .write_all(&contenido)
            .map_err(|err| format!("No se pudo escribir la credencial: {err}"))?;
    }

    // Renombrado atómico: un corte de luz a media escritura deja el archivo
    // anterior intacto en vez de uno truncado que no descifra. Perder la sesión
    // no es grave; que la aplicación no arranque porque no sabe leer lo que ella
    // misma escribió, sí.
    fs::rename(&temporal, &ruta).map_err(|err| format!("No se pudo guardar la credencial: {err}"))
}

/// Lee un valor. `Ok(None)` si no está, que es el estado normal antes del primer
/// inicio de sesión.
pub fn leer(clave: &str) -> Result<Option<String>, String> {
    let ruta = ruta_de(clave)?;
    let contenido = match fs::read(&ruta) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("No se pudo leer la credencial: {err}")),
    };

    if contenido.len() <= 24 {
        return Err("El archivo de credenciales está incompleto.".into());
    }
    let (nonce, cifrado) = contenido.split_at(24);

    let descifrado = XChaCha20Poly1305::new(&clave_de_cifrado()?)
        .decrypt(XNonce::from_slice(nonce), cifrado)
        // Aquí se llega cuando el archivo viajó a otra máquina o el sistema se
        // reinstaló: la clave derivada ya no es la misma. No es corrupción y no
        // hay nada que reparar; lo que toca es volver a iniciar sesión.
        .map_err(|_| "La credencial guardada no se pudo descifrar en este equipo.".to_string())?;

    String::from_utf8(descifrado)
        .map(Some)
        .map_err(|_| "La credencial guardada no es texto válido.".into())
}

/// Borra un valor. Que no estuviera es un éxito, no un fallo.
pub fn borrar(clave: &str) -> Result<(), String> {
    match fs::remove_file(ruta_de(clave)?) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("No se pudo borrar la credencial: {err}")),
    }
}
