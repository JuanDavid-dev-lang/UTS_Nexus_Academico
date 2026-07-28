//! Credential storage backed by the operating system vault.
//!
//! The previous desktop client kept JWT access and refresh tokens in QSettings,
//! which on Windows means plain text inside the registry. Here the tokens never
//! touch disk in readable form: Windows uses DPAPI, macOS the Keychain and Linux
//! the Secret Service.
//!
//! The WebView can only reach these values through the three commands below, so
//! a compromised page cannot enumerate the vault.

use keyring::Entry;

const SERVICE: &str = "co.edu.uts.nexus.academico";

/// Only these keys may be written. An allowlist keeps the renderer from turning
/// the OS vault into arbitrary storage.
const ALLOWED_KEYS: [&str; 3] = ["access_token", "refresh_token", "api_base_url"];

fn entry_for(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("Key not allowed in secure store: {key}"));
    }
    Entry::new(SERVICE, key).map_err(|err| format!("Could not open secure store: {err}"))
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    entry_for(&key)?
        .set_password(&value)
        .map_err(|err| format!("Could not write secure store: {err}"))
}

/// Returns `None` when the entry does not exist yet, which is the normal state
/// before the first login. Only genuine backend failures surface as errors.
#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    match entry_for(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("Could not read secure store: {err}")),
    }
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    match entry_for(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        // Deleting something that is already gone is a success, not a failure.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("Could not clear secure store: {err}")),
    }
}
