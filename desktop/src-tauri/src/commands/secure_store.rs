//! Credential storage backed by the operating system vault.
//!
//! The previous desktop client kept JWT access and refresh tokens in QSettings,
//! which on Windows means plain text inside the registry. Here the tokens never
//! touch disk in readable form: Windows uses DPAPI, macOS the Keychain and Linux
//! the Secret Service.
//!
//! The WebView can only reach these values through the commands below, so a
//! compromised page cannot enumerate the vault.
//!
//! # Linux: el llavero puede no existir
//!
//! En Windows y macOS el almacén es parte del sistema y siempre responde. En
//! Linux es un paquete —gnome-keyring, KWallet— que puede no estar instalado, y
//! no lo está en un XFCE mínimo, en i3 ni en varios Debian de escritorio. Ahí
//! `set_password` falla, y sin respaldo eso significa que no se puede iniciar
//! sesión: la aplicación no sirve.
//!
//! Por eso en Linux hay un respaldo cifrado en disco (`almacen_linux`), y por
//! eso el orden es siempre **primero el llavero**: quien lo tenga conserva la
//! garantía completa, y solo cae al archivo quien no tiene alternativa.
//!
//! La lectura mira los dos sitios. Quien empezó sin llavero y luego lo instaló
//! —o al revés— no pierde la sesión por un cambio en su sistema que no tiene
//! nada que ver con esta aplicación.

use keyring::Entry;

const SERVICE: &str = "co.edu.uts.nexus.academico";

/// Only these keys may be written. An allowlist keeps the renderer from turning
/// the OS vault into arbitrary storage.
const ALLOWED_KEYS: [&str; 3] = ["access_token", "refresh_token", "api_base_url"];

/// La lista blanca, comprobada sin abrir nada.
///
/// Está separada de `entry_for` porque el respaldo de Linux no pasa por `Entry`
/// y necesita la misma puerta: si solo la comprobara `entry_for`, un fallo del
/// llavero volvería la lista blanca opcional justo en el camino que se usa
/// cuando algo va mal.
fn validar_clave(key: &str) -> Result<(), String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("Key not allowed in secure store: {key}"));
    }
    Ok(())
}

fn entry_for(key: &str) -> Result<Entry, String> {
    validar_clave(key)?;
    Entry::new(SERVICE, key).map_err(|err| format!("Could not open secure store: {err}"))
}

/// ¿Este error significa «no hay llavero» o «el llavero falló»?
///
/// La diferencia decide si se cae al respaldo o se informa del fallo, y no es
/// cosmética. `NoStorageAccess` y `PlatformFailure` son lo que devuelve el
/// Secret Service cuando no hay ningún servicio escuchando en D-Bus, que es la
/// situación normal en un escritorio sin gnome-keyring ni KWallet: no es una
/// avería, es una máquina configurada de otra manera. Tratarla como avería
/// dejaría a esos equipos sin poder iniciar sesión; tratar como ausencia
/// **cualquier** error taparía un llavero bloqueado o lleno, que sí hay que
/// contar.
fn es_ausencia_de_llavero(err: &keyring::Error) -> bool {
    matches!(
        err,
        keyring::Error::NoEntry | keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_)
    )
}

// ── El respaldo, en tres funciones con dos versiones cada una ──────────────
//
// Se separan por `cfg` a nivel de función y no con bloques dentro de los
// comandos por una razón práctica: `#[cfg]` sobre la expresión final de un
// bloque no compila en Rust estable —los atributos sobre expresiones siguen
// siendo inestables—, así que la forma que se lee bien no es la que compila. Y
// de paso, cada comando queda con un solo camino que leer.

/// Escribe en el respaldo cuando el llavero no pudo.
#[cfg(target_os = "linux")]
fn respaldo_guardar(key: &str, value: &str, _fallo_del_llavero: String) -> Result<(), String> {
    crate::almacen_linux::guardar(key, value)
}

/// Fuera de Linux no hay respaldo: el almacén del sistema siempre está, así que
/// un fallo suyo es un fallo de verdad y hay que contarlo.
#[cfg(not(target_os = "linux"))]
fn respaldo_guardar(_key: &str, _value: &str, fallo_del_llavero: String) -> Result<(), String> {
    Err(fallo_del_llavero)
}

/// Lee del respaldo cuando el llavero no tenía la entrada, o no está.
#[cfg(target_os = "linux")]
fn respaldo_leer(key: &str, fallo_del_llavero: Option<String>) -> Result<Option<String>, String> {
    match crate::almacen_linux::leer(key) {
        Ok(Some(value)) => Ok(Some(value)),
        // Sin nada en ninguno de los dos sitios: no hay sesión guardada, que es
        // distinto de un fallo.
        Ok(None) => match fallo_del_llavero {
            Some(err) => Err(err),
            None => Ok(None),
        },
        Err(err) => Err(fallo_del_llavero.unwrap_or(err)),
    }
}

#[cfg(not(target_os = "linux"))]
fn respaldo_leer(_key: &str, fallo_del_llavero: Option<String>) -> Result<Option<String>, String> {
    match fallo_del_llavero {
        Some(err) => Err(err),
        None => Ok(None),
    }
}

/// Borra del respaldo, además de lo que ya hiciera el llavero.
#[cfg(target_os = "linux")]
fn respaldo_borrar(key: &str, resultado_del_llavero: Result<(), String>) -> Result<(), String> {
    crate::almacen_linux::borrar(key).and(resultado_del_llavero)
}

#[cfg(not(target_os = "linux"))]
fn respaldo_borrar(_key: &str, resultado_del_llavero: Result<(), String>) -> Result<(), String> {
    resultado_del_llavero
}

/// Limpia el respaldo cuando el llavero sí aceptó la escritura.
///
/// Lo que quedara ahí es un valor viejo. Dejarlo sería conservar un token
/// caducado en disco sin ninguna razón, y la lectura pasante podría devolverlo
/// si el llavero fallara más adelante.
#[cfg(target_os = "linux")]
fn respaldo_limpiar(key: &str) {
    let _ = crate::almacen_linux::borrar(key);
}

#[cfg(not(target_os = "linux"))]
fn respaldo_limpiar(_key: &str) {}

/// Dónde se está guardando de verdad, probándolo en vez de deducirlo.
#[cfg(target_os = "linux")]
fn almacen_en_uso() -> &'static str {
    // Una lectura basta y no escribe nada; que conteste `NoEntry` ya demuestra
    // que hay alguien contestando. Un Debian con gnome-keyring y otro sin él
    // son el mismo sistema operativo y guardan en sitios distintos, así que
    // deducirlo del `target_os` daría la respuesta equivocada la mitad de las
    // veces.
    let responde = matches!(
        Entry::new(SERVICE, ALLOWED_KEYS[0]).map(|entrada| entrada.get_password()),
        Ok(Ok(_)) | Ok(Err(keyring::Error::NoEntry))
    );
    if responde { "llavero" } else { "archivo" }
}

#[cfg(not(target_os = "linux"))]
fn almacen_en_uso() -> &'static str {
    "llavero"
}

// ── Los comandos ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    validar_clave(&key)?;

    match entry_for(&key).and_then(|entrada| {
        entrada
            .set_password(&value)
            .map_err(|err| format!("Could not write secure store: {err}"))
    }) {
        Ok(()) => {
            respaldo_limpiar(&key);
            Ok(())
        }
        Err(err) => respaldo_guardar(&key, &value, err),
    }
}

/// Returns `None` when the entry does not exist yet, which is the normal state
/// before the first login. Only genuine backend failures surface as errors.
#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    validar_clave(&key)?;

    let fallo_real = match entry_for(&key).map(|entrada| entrada.get_password()) {
        Ok(Ok(value)) => return Ok(Some(value)),
        Ok(Err(err)) if es_ausencia_de_llavero(&err) => None,
        Ok(Err(err)) => Some(format!("Could not read secure store: {err}")),
        Err(err) => Some(err),
    };

    // Lectura pasante: el llavero no la tiene, o no hay llavero. Se mira el
    // respaldo antes de dar la sesión por perdida, porque quien empezó sin
    // llavero y luego lo instaló guardó ahí su sesión.
    respaldo_leer(&key, fallo_real)
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    validar_clave(&key)?;

    // Los dos sitios, siempre. Borrar solo donde se escribió dejaría el token
    // en el otro si el llavero apareció o desapareció entre medias, y cerrar
    // sesión tiene que cerrar sesión.
    let llavero = match entry_for(&key).map(|entrada| entrada.delete_credential()) {
        Ok(Ok(())) => Ok(()),
        // Borrar algo que ya no está, o que nunca se pudo guardar ahí, es un
        // éxito. Lo que no lo es: un llavero que responde y se niega.
        Ok(Err(err)) if es_ausencia_de_llavero(&err) => Ok(()),
        Ok(Err(err)) => Err(format!("Could not clear secure store: {err}")),
        Err(err) => Err(err),
    };

    respaldo_borrar(&key, llavero)
}

/// Dónde están guardadas las credenciales en este equipo.
///
/// Existe para que Configuración lo pueda decir. Un respaldo cifrado en disco
/// protege menos que el llavero del sistema —lo explica `almacen_linux`— y
/// callarlo sería vender una garantía que en esa máquina no se está dando.
#[tauri::command]
pub fn secure_store_backend() -> String {
    almacen_en_uso().to_string()
}
