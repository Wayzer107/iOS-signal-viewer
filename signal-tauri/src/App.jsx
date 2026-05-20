import React, { createContext, useContext, useState } from 'react'
import { Routes, Route, Navigate, useParams, useLocation, useNavigate, NavLink } from 'react-router-dom'
import { pickAndOpenDb, api } from './api.js'
import ThreadView from './components/ThreadView.jsx'
import SearchView from './components/SearchView.jsx'

const ArchiveContext = createContext(null)
export const useArchive = () => useContext(ArchiveContext)

export default function App() {
  const [phase, setPhase]         = useState('pick') // 'pick' | 'loading' | 'ready'
  const [error, setError]         = useState(null)
  const [archiveData, setArchiveData] = useState(null)

  async function openArchive() {
    setError(null)
    setPhase('loading')
    try {
      const path = await pickAndOpenDb()
      if (!path) { setPhase('pick'); return }
      const [convs, recips, info] = await Promise.all([
        api.conversations(), api.recipients(), api.info(),
      ])
      setArchiveData({
        conversations: convs,
        recipients: Object.fromEntries(recips.map(r => [r.id, r])),
        info,
      })
      setPhase('ready')
    } catch (e) {
      setError(e.message ?? String(e))
      setPhase('pick')
    }
  }

  if (phase === 'ready') {
    return (
      <ArchiveContext.Provider value={archiveData}>
        <ArchiveApp onReopen={openArchive} />
      </ArchiveContext.Provider>
    )
  }

  return <FilePicker onOpen={openArchive} loading={phase === 'loading'} error={error} />
}

function FilePicker({ onOpen, loading, error }) {
  return (
    <div className="h-full flex items-center justify-center bg-slate-900">
      <div className="text-center space-y-6 max-w-sm px-6">
        <div>
          <div className="text-2xl font-semibold text-white mb-1">Signal Archive</div>
          <div className="text-sm text-slate-400">Native desktop app — powered by Rust + SQLite</div>
        </div>

        <button
          onClick={onOpen}
          disabled={loading}
          className="w-full border-2 border-dashed border-slate-600 hover:border-slate-400 rounded-2xl p-10 cursor-pointer transition-colors disabled:opacity-50"
        >
          {loading ? (
            <div className="text-slate-400 text-sm">Opening archive…</div>
          ) : (
            <>
              <div className="text-4xl mb-3">📂</div>
              <div className="text-white font-medium text-sm">Click to open archive</div>
              <div className="text-slate-500 text-xs mt-1">Selects a .sqlite file via the system picker</div>
            </>
          )}
        </button>

        {error && (
          <div className="text-red-400 text-sm bg-red-900/30 rounded-lg px-4 py-3">{error}</div>
        )}
      </div>
    </div>
  )
}

function ArchiveApp({ onReopen }) {
  const { conversations } = useArchive()
  const location = useLocation()

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <Sidebar onReopen={onReopen} />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={conversations[0] ? `/conversations/${conversations[0].id}` : '/search'} replace />}
          />
          <Route path="/conversations/:id" element={<ConvRoute />} />
          <Route path="/search" element={<SearchView />} />
        </Routes>
      </main>
    </div>
  )
}

function ConvRoute() {
  const { id } = useParams()
  const location = useLocation()
  const anchorId = location.state?.anchorMessageId ?? null
  return <ThreadView key={id} conversationId={parseInt(id)} anchorMessageId={anchorId} />
}

function Sidebar({ onReopen }) {
  const { conversations, info } = useArchive()
  const location = useLocation()
  const [filter, setFilter] = useState('')

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(filter.toLowerCase())
  )
  const pinned   = filtered.filter(c => c.pinned_order != null && !c.archived)
  const regular  = filtered.filter(c => c.pinned_order == null && !c.archived)
  const archived = filtered.filter(c => c.archived)

  return (
    <aside className="w-72 flex-shrink-0 bg-slate-900 text-white flex flex-col overflow-hidden border-r border-slate-700">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="text-base font-semibold text-white">Signal Archive</div>
        {info && (
          <div className="text-xs text-slate-400 mt-0.5">
            {Number(info.message_count).toLocaleString()} messages · {info.conversation_count} conversations
          </div>
        )}
      </div>

      <div className="px-3 pb-2 flex-shrink-0 space-y-1">
        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          Search
        </NavLink>
        <input
          type="text"
          placeholder="Filter chats…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full px-3 py-1.5 bg-slate-800 text-sm text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {pinned.length > 0 && <SectionHeader label="Pinned" />}
        {pinned.map(c => <ConvItem key={c.id} conv={c} active={location.pathname === `/conversations/${c.id}`} />)}
        {regular.map(c => <ConvItem key={c.id} conv={c} active={location.pathname === `/conversations/${c.id}`} />)}
        {archived.length > 0 && (
          <>
            <SectionHeader label="Archived" />
            {archived.map(c => <ConvItem key={c.id} conv={c} active={location.pathname === `/conversations/${c.id}`} />)}
          </>
        )}
      </div>

      <div className="px-3 pb-3 flex-shrink-0">
        <button
          onClick={onReopen}
          className="w-full text-xs text-slate-500 hover:text-slate-300 py-2 transition-colors"
        >
          Open different archive…
        </button>
      </div>
    </aside>
  )
}

function SectionHeader({ label }) {
  return (
    <div className="px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
  )
}

function ConvItem({ conv, active }) {
  const lastDate = conv.last_ts
    ? new Date(conv.last_ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
  return (
    <NavLink
      to={`/conversations/${conv.id}`}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        active ? 'bg-slate-700' : 'hover:bg-slate-800'
      }`}
    >
      <Avatar name={conv.title} isGroup={conv.is_group} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium text-white truncate">{conv.title}</span>
          <span className="text-xs text-slate-500 flex-shrink-0">{lastDate}</span>
        </div>
        <div className="text-xs text-slate-400">{conv.message_count.toLocaleString()} messages</div>
      </div>
    </NavLink>
  )
}

function Avatar({ name, isGroup }) {
  const palette = [
    'bg-red-500','bg-orange-500','bg-amber-500','bg-yellow-500',
    'bg-lime-500','bg-green-500','bg-teal-500','bg-cyan-500',
    'bg-blue-500','bg-indigo-500','bg-violet-500','bg-purple-500',
    'bg-pink-500','bg-rose-500',
  ]
  const bg = palette[Math.abs(hashStr(name)) % palette.length]
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white ${bg}`}>
      {isGroup
        ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM15.22 14.79A5.002 5.002 0 0 0 10 11c-2.28 0-4.198 1.53-4.22 3.79A9.953 9.953 0 0 0 10 16a9.953 9.953 0 0 0 4.22-1.21zM17 15.87V16a9.966 9.966 0 0 0 1-.07v-.06c-.32-.87-1.17-1.57-2.22-1.87.36.56.57 1.23.57 1.94h.65zM2.22 15.87H2.87c0-.71.21-1.38.57-1.94C2.39 14.23 1.54 14.93 1.22 15.8L1.22 15.87H2.22z"/></svg>
        : initials
      }
    </div>
  )
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
