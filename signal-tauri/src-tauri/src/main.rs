// Prevents an additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
use db::ArchiveDb;
use std::sync::Mutex;
use serde_json::Value;

struct DbState(Mutex<Option<ArchiveDb>>);

#[tauri::command]
fn open_db(path: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let db = ArchiveDb::open(&path).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(db);
    Ok(())
}

#[tauri::command]
fn get_info(state: tauri::State<'_, DbState>) -> Result<Value, String> {
    with_db(&state, |db| db.get_info())
}

#[tauri::command]
fn get_conversations(state: tauri::State<'_, DbState>) -> Result<Value, String> {
    with_db(&state, |db| db.get_conversations())
}

#[tauri::command]
fn get_recipients(state: tauri::State<'_, DbState>) -> Result<Value, String> {
    with_db(&state, |db| db.get_recipients())
}

#[tauri::command]
fn get_messages(
    conv_id: i64,
    params: Value,
    state: tauri::State<'_, DbState>,
) -> Result<Value, String> {
    with_db(&state, |db| db.get_messages(conv_id, &params))
}

#[tauri::command]
fn search(
    q: String,
    filters: Value,
    state: tauri::State<'_, DbState>,
) -> Result<Value, String> {
    with_db(&state, |db| db.search(&q, &filters))
}

#[tauri::command]
fn get_stats(
    conv_id: i64,
    state: tauri::State<'_, DbState>,
) -> Result<Value, String> {
    with_db(&state, |db| db.get_stats(conv_id))
}

fn with_db<F>(state: &tauri::State<'_, DbState>, f: F) -> Result<Value, String>
where
    F: FnOnce(&ArchiveDb) -> rusqlite::Result<Value>,
{
    let guard = state.0.lock().unwrap();
    let db = guard.as_ref().ok_or("No database open — call open_db first")?;
    f(db).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            open_db,
            get_info,
            get_conversations,
            get_recipients,
            get_messages,
            search,
            get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
