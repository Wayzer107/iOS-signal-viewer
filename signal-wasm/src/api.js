// All SQLite work runs in a classic Web Worker (public/worker.js).
// This module wraps it in a Promise-based API matching signal-web's api.js.

const worker = new Worker('/worker.js')
let nextId = 1
const pending = new Map()

worker.onmessage = ({ data }) => {
  if (data.type === 'ready') return
  const p = pending.get(data.id)
  if (!p) return
  pending.delete(data.id)
  if (data.error) p.reject(new Error(data.error))
  else p.resolve(data.result)
}

function call(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, method, args })
  })
}

// Opens a .sqlite file from an ArrayBuffer and initialises the in-memory DB.
export const openDb = buffer => call('init', buffer)

export const api = {
  info:          ()                 => call('getInfo'),
  conversations: ()                 => call('getConversations'),
  recipients:    ()                 => call('getRecipients'),
  stats:         convId             => call('getStats', convId),
  // signal parameter is ignored — the synchronous WASM path is fast enough that aborting is unnecessary
  messages:      (convId, params)   => call('getMessages', convId, params),
  search:        (q, filters = {})  => call('search', q, filters),
}
