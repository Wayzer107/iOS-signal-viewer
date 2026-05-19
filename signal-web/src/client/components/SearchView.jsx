import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useArchive } from '../App.jsx'

// Render FTS5 snippet — «matched» parts highlighted
function Snippet({ text }) {
  const parts = text.split(/([«»])/)
  let highlight = false
  return (
    <span>
      {parts.map((chunk, i) => {
        if (chunk === '«') { highlight = true;  return null }
        if (chunk === '»') { highlight = false; return null }
        return highlight
          ? <mark key={i} className="bg-yellow-200 text-slate-900 font-medium rounded px-0.5">{chunk}</mark>
          : <span key={i}>{chunk}</span>
      })}
    </span>
  )
}

const SORT_MODES = [
  { key: 'newest',    label: 'Newest first' },
  { key: 'oldest',   label: 'Oldest first' },
  { key: 'relevance', label: 'Relevance' },
]

function sortResults(results, mode) {
  const copy = [...results]
  if (mode === 'newest')    return copy.sort((a, b) => b.timestamp - a.timestamp)
  if (mode === 'oldest')    return copy.sort((a, b) => a.timestamp - b.timestamp)
  if (mode === 'relevance') return copy.sort((a, b) => a.rank - b.rank) // lower bm25 = better
  return copy
}

export default function SearchView() {
  const { conversations, recipients } = useArchive()
  const navigate = useNavigate()

  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [sortMode, setSortMode]   = useState('newest')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Filters
  const [filterConvId,   setFilterConvId]   = useState('')
  const [filterAuthorId, setFilterAuthorId] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate,   setFilterEndDate]   = useState('')

  const debounceRef = useRef(null)

  const runSearch = useCallback((q, filters) => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.search(q, {
          convId:   filters.convId   || null,
          authorId: filters.authorId || null,
          startMs:  filters.startDate ? new Date(filters.startDate).getTime() : null,
          endMs:    filters.endDate   ? new Date(filters.endDate).getTime()   : null,
        })
        setResults(data)
        setSortMode('newest') // reset sort on new search
      } catch (e) {
        console.error('Search error:', e)
      } finally {
        setSearching(false)
      }
    }, 150)
  }, [])

  const handleQueryChange = e => {
    const q = e.target.value
    setQuery(q)
    runSearch(q, { convId: filterConvId, authorId: filterAuthorId, startDate: filterStartDate, endDate: filterEndDate })
  }

  const handleFilterChange = (field, value) => {
    const filters = { convId: filterConvId, authorId: filterAuthorId, startDate: filterStartDate, endDate: filterEndDate, [field]: value }
    if (field === 'convId')    setFilterConvId(value)
    if (field === 'authorId')  setFilterAuthorId(value)
    if (field === 'startDate') setFilterStartDate(value)
    if (field === 'endDate')   setFilterEndDate(value)
    runSearch(query, filters)
  }

  const clearFilter = field => handleFilterChange(field, '')

  const sorted = sortResults(results, sortMode)
  const hasFilters = filterConvId || filterAuthorId || filterStartDate || filterEndDate

  // All recipients for the sender picker
  const allRecipients = Object.values(recipients).sort((a, b) => a.display_name.localeCompare(b.display_name))

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-5 py-3 border-b border-slate-200 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search messages…"
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.54-10.46a.75.75 0 0 0-1.06-1.06L10 8.94 7.54 6.48a.75.75 0 0 0-1.06 1.06L8.94 10l-2.46 2.46a.75.75 0 0 0 1.06 1.06L10 11.06l2.46 2.46a.75.75 0 0 0 1.06-1.06L11.06 10l2.46-2.46z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Sort picker — only when there are results */}
          {results.length > 0 && (
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {SORT_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          )}

          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              hasFilters ? 'border-blue-400 text-blue-500 bg-blue-50' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2M13 16h-2" />
            </svg>
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <select
              value={filterConvId}
              onChange={e => handleFilterChange('convId', e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Any conversation</option>
              {conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>

            <select
              value={filterAuthorId}
              onChange={e => handleFilterChange('authorId', e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Anyone</option>
              {allRecipients.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>

            <div className="flex items-center gap-1">
              <label className="text-xs text-slate-500 w-10">After</label>
              <input type="date" value={filterStartDate} onChange={e => handleFilterChange('startDate', e.target.value)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>

            <div className="flex items-center gap-1">
              <label className="text-xs text-slate-500 w-10">Before</label>
              <input type="date" value={filterEndDate} onChange={e => handleFilterChange('endDate', e.target.value)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap gap-1.5">
            {filterConvId && (
              <Chip label={`Chat: ${conversations.find(c => String(c.id) === filterConvId)?.title ?? filterConvId}`}
                onRemove={() => clearFilter('convId')} />
            )}
            {filterAuthorId && (
              <Chip label={`From: ${recipients[filterAuthorId]?.display_name ?? filterAuthorId}`}
                onRemove={() => clearFilter('authorId')} />
            )}
            {filterStartDate && <Chip label={`After: ${filterStartDate}`} onRemove={() => clearFilter('startDate')} />}
            {filterEndDate   && <Chip label={`Before: ${filterEndDate}`}  onRemove={() => clearFilter('endDate')} />}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-8 text-slate-400 text-sm">Searching…</div>
        )}

        {!searching && query && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0H4" />
            </svg>
            <span className="text-sm">No matches</span>
          </div>
        )}

        {!searching && !query && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <span className="text-sm">Search across every conversation</span>
            <span className="text-xs text-center px-8">Try a phrase or use AND / OR / NOT for boolean search</span>
          </div>
        )}

        {!searching && sorted.length > 0 && (
          <>
            <div className="px-5 py-2 text-xs text-slate-400 border-b border-slate-100">
              {sorted.length.toLocaleString()} result{sorted.length !== 1 ? 's' : ''}
            </div>
            {sorted.map(r => (
              <SearchResultRow key={r.message_id} result={r} onClick={() =>
                navigate(`/conversations/${r.conversation_id}`, {
                  state: { anchorMessageId: r.message_id }
                })
              } />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function SearchResultRow({ result: r, onClick }) {
  const date = new Date(r.timestamp)
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {r.is_group
            ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>
            : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z" clipRule="evenodd"/></svg>
          }
          <span className="font-medium truncate max-w-[200px]">{r.conversation_title}</span>
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">{dateStr} {timeStr}</span>
      </div>
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className={`font-semibold flex-shrink-0 ${r.direction === 'outgoing' ? 'text-blue-500' : 'text-slate-700'}`}>
          {r.author_name}:
        </span>
        <span className="text-slate-600 line-clamp-2 text-left">
          <Snippet text={r.snippet} />
        </span>
      </div>
    </button>
  )
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
      {label}
      <button onClick={onRemove} className="text-blue-400 hover:text-blue-600">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.54-10.46a.75.75 0 0 0-1.06-1.06L10 8.94 7.54 6.48a.75.75 0 0 0-1.06 1.06L8.94 10l-2.46 2.46a.75.75 0 0 0 1.06 1.06L10 11.06l2.46 2.46a.75.75 0 0 0 1.06-1.06L11.06 10l2.46-2.46z" clipRule="evenodd"/>
        </svg>
      </button>
    </span>
  )
}
