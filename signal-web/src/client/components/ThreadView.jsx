import React, { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useArchive } from '../App.jsx'
import MessageRow, { DayHeader } from './MessageRow.jsx'

export default function ThreadView({ conversationId, anchorMessageId }) {
  const { conversations, recipients } = useArchive()
  const conv = conversations.find(c => c.id === conversationId)

  const [messages, setMessages]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [atOldest, setAtOldest]     = useState(false)
  const [atNewest, setAtNewest]     = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)

  const containerRef  = useRef(null)
  const anchorRef     = useRef(null)
  const prevHeightRef = useRef(0)

  // Initial load
  useEffect(() => {
    setLoading(true)
    setMessages([])
    setAtOldest(false)
    setAtNewest(false)

    const params = anchorMessageId
      ? { anchorId: anchorMessageId, before: 80, after: 80 }
      : { limit: 120 }

    api.messages(conversationId, params)
      .then(msgs => {
        setMessages(msgs)
        if (!anchorMessageId) setAtNewest(true)
        if (msgs.length < (anchorMessageId ? 160 : 120)) setAtOldest(true)
      })
      .finally(() => setLoading(false))
  }, [conversationId, anchorMessageId])

  // Scroll to anchor or bottom after initial load
  useEffect(() => {
    if (loading || !messages.length) return
    const el = containerRef.current
    if (!el) return
    if (anchorMessageId && anchorRef.current) {
      anchorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    if (loadingOlder || atOldest || !messages.length) return
    const oldest = messages[0]
    setLoadingOlder(true)
    prevHeightRef.current = containerRef.current?.scrollHeight ?? 0
    try {
      const more = await api.messages(conversationId, {
        direction: 'before', refId: oldest.id, refTs: oldest.timestamp,
      })
      if (!more.length) { setAtOldest(true); return }
      setMessages(prev => [...more, ...prev])
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, atOldest, messages, conversationId])

  // Restore scroll position after prepend
  useEffect(() => {
    if (loadingOlder || !prevHeightRef.current || !containerRef.current) return
    const el = containerRef.current
    el.scrollTop = el.scrollHeight - prevHeightRef.current
    prevHeightRef.current = 0
  }, [loadingOlder, messages.length])

  const loadNewer = useCallback(async () => {
    if (loadingNewer || atNewest || !messages.length) return
    const newest = messages[messages.length - 1]
    setLoadingNewer(true)
    try {
      const more = await api.messages(conversationId, {
        direction: 'after', refId: newest.id, refTs: newest.timestamp,
      })
      if (!more.length) { setAtNewest(true); return }
      setMessages(prev => [...prev, ...more])
    } finally {
      setLoadingNewer(false)
    }
  }, [loadingNewer, atNewest, messages, conversationId])

  const isGroup = conv?.is_group ?? false

  // Group messages by day for headers
  const rows = []
  let lastDay = null
  for (const msg of messages) {
    const day = new Date(msg.timestamp).toDateString()
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${msg.timestamp}`, date: msg.timestamp })
      lastDay = day
    }
    rows.push({ type: 'msg', key: msg.id, msg })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 flex-shrink-0 bg-white">
        <div>
          <div className="font-semibold text-slate-900">{conv?.title ?? 'Thread'}</div>
          <div className="text-xs text-slate-400">
            {conv?.message_count.toLocaleString()} messages
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2">
        {loading && (
          <div className="flex justify-center py-8 text-slate-400 text-sm">Loading…</div>
        )}

        {!loading && (
          <>
            {/* Load older */}
            <div className="flex justify-center mb-3">
              {atOldest ? (
                <span className="text-xs text-slate-400">Beginning of conversation</span>
              ) : (
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="text-xs text-blue-500 hover:text-blue-700 disabled:text-slate-400 border border-slate-200 rounded-full px-4 py-1"
                >
                  {loadingOlder ? 'Loading…' : 'Load earlier'}
                </button>
              )}
            </div>

            {rows.map(row =>
              row.type === 'day'
                ? <DayHeader key={row.key} date={row.date} />
                : (
                  <div
                    key={row.key}
                    ref={row.msg.id === anchorMessageId ? anchorRef : null}
                  >
                    <MessageRow
                      message={row.msg}
                      author={recipients[row.msg.author_id]}
                      quoteAuthor={row.msg.quote_author_id ? recipients[row.msg.quote_author_id] : null}
                      isAnchor={row.msg.id === anchorMessageId}
                      isGroup={isGroup}
                    />
                  </div>
                )
            )}

            {/* Load newer */}
            <div className="flex justify-center mt-3">
              {atNewest ? (
                <span className="text-xs text-slate-400">End of conversation</span>
              ) : (
                <button
                  onClick={loadNewer}
                  disabled={loadingNewer}
                  className="text-xs text-blue-500 hover:text-blue-700 disabled:text-slate-400 border border-slate-200 rounded-full px-4 py-1"
                >
                  {loadingNewer ? 'Loading…' : 'Load newer'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
