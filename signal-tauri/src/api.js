// All DB calls go through Tauri's IPC bridge via invoke().
// The Rust backend (src-tauri/src/db.rs) runs SQLite natively — zero serialization overhead vs HTTP.
import { invoke } from '@tauri-apps/api/core'
import { open }   from '@tauri-apps/plugin-dialog'

export async function pickAndOpenDb() {
  const path = await open({
    title: 'Open Signal archive',
    filters: [{ name: 'SQLite archive', extensions: ['sqlite', 'db'] }],
    multiple: false,
  })
  if (!path) return null
  await invoke('open_db', { path })
  return path
}

export const api = {
  info:          ()               => invoke('get_info'),
  conversations: ()               => invoke('get_conversations'),
  recipients:    ()               => invoke('get_recipients'),
  stats:         convId           => invoke('get_stats',    { convId }),
  messages:      (convId, params) => invoke('get_messages', { convId, params: params ?? {} }),
  // signal is unused — Tauri invoke() doesn't support AbortController,
  // but Rust queries are synchronous and very fast
  search:        (q, filters)     => invoke('search',       { q, filters: filters ?? {} }),
}
