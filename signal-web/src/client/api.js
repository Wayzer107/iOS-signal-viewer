const base = '/api'

async function get(path) {
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  info: ()                    => get('/info'),
  conversations: ()           => get('/conversations'),
  recipients: ()              => get('/recipients'),
  stats: (convId)             => get(`/stats/${convId}`),

  messages: (convId, params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v != null && q.set(k, v))
    return get(`/conversations/${convId}/messages?${q}`)
  },

  search: (q, filters = {}) => {
    const params = new URLSearchParams({ q })
    if (filters.convId)   params.set('convId',   filters.convId)
    if (filters.authorId) params.set('authorId', filters.authorId)
    if (filters.startMs)  params.set('startMs',  filters.startMs)
    if (filters.endMs)    params.set('endMs',     filters.endMs)
    return get(`/search?${params}`)
  },
}
