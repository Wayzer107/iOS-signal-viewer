import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { api } from '../api.js'
import { useArchive } from '../App.jsx'
import MessageRow, { DayHeader } from './MessageRow.jsx'

export default function ThreadView({ conversationId, anchorMessageId }) {
  const { conversations, recipients } = useArchive()
  const conv = conversations.find(c => c.id === conversationId)

  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [atOldest, setAtOldest] = useState(false)
  const [atNewest, setAtNewest] = useState(false)

  const loadingOlderRef    = useRef(false)
  const loadingNewerRef    = useRef(false)
  const prependedRef       = useRef(false)
  const savedScrollHtRef   = useRef(0)
  const initialScrollDone  = useRef(false)
  const doLoadOlderRef     = useRef(null)
  const doLoadNewerRef     = useRef(null)
  const containerRef       = useRef(null)

  // Build rows with day-separator headers
  const rows = []
  if (atOldest && messages.length) rows.push({ type: 'top', key: '__top' })
  let lastDay = null
  for (const msg of messages) {
    const day = new Date(msg.timestamp).toDateString()
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${msg.timestamp}`, date: msg.timestamp })
      lastDay = day
    }
    rows.push({ type: 'msg', key: String(msg.id), msg })
  }
  if (atNewest && messages.length) rows.push({ type: 'bottom', key: '__bottom' })

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 72,
    overscan: 10,
    measureElement: el => el?.getBoundingClientRect().height ?? 72,
  })

  // Initial load
  useEffect(() => {
    setLoading(true)
    setMessages([])
    setAtOldest(false)
    setAtNewest(false)
    initialScrollDone.current = false

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
  useLayoutEffect(() => {
    if (loading || initialScrollDone.current || !rows.length) return
    initialScrollDone.current = true
    if (anchorMessageId) {
      const idx = rows.findIndex(r => r.type === 'msg' && r.msg.id === anchorMessageId)
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' })
    } else {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll position after prepend
  useLayoutEffect(() => {
    if (!prependedRef.current || !savedScrollHtRef.current || !containerRef.current) return
    prependedRef.current = false
    const el = containerRef.current
    el.scrollTop += el.scrollHeight - savedScrollHtRef.current
    savedScrollHtRef.current = 0
  }, [messages])

  const doLoadOlder = useCallback(async () => {
    if (loadingOlderRef.current || atOldest || !messages.length) return
    loadingOlderRef.current = true
    savedScrollHtRef.current = containerRef.current?.scrollHeight ?? 0
    prependedRef.current = true
    const oldest = messages[0]
    try {
      const more = await api.messages(conversationId, {
        direction: 'before', refId: oldest.id, refTs: oldest.timestamp,
      })
      if (!more.length) {
        setAtOldest(true)
        prependedRef.current = false
        savedScrollHtRef.current = 0
      } else {
        setMessages(prev => [...more, ...prev])
      }
    } finally {
      loadingOlderRef.current = false
    }
  }, [atOldest, messages, conversationId])

  const doLoadNewer = useCallback(async () => {
    if (loadingNewerRef.current || atNewest || !messages.length) return
    loadingNewerRef.current = true
    const newest = messages[messages.length - 1]
    try {
      const more = await api.messages(conversationId, {
        direction: 'after', refId: newest.id, refTs: newest.timestamp,
      })
      if (!more.length) {
        setAtNewest(true)
      } else {
        setMessages(prev => [...prev, ...more])
      }
    } finally {
      loadingNewerRef.current = false
    }
  }, [atNewest, messages, conversationId])

  // Keep refs current so scroll handler always calls latest version
  useEffect(() => { doLoadOlderRef.current = doLoadOlder }, [doLoadOlder])
  useEffect(() => { doLoadNewerRef.current = doLoadNewer }, [doLoadNewer])

  // Auto-load when scrolled within 300px of either edge
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const THRESHOLD = 300
    const onScroll = () => {
      if (el.scrollTop < THRESHOLD) doLoadOlderRef.current?.()
      if (el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD) doLoadNewerRef.current?.()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, []) // containerRef is stable

  const isGroup = conv?.is_group ?? false

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
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8 text-slate-400 text-sm">Loading…</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => {
              const row = rows[vItem.index]
              return (
                <div
                  key={row.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  {row.type === 'top' && (
                    <div className="flex justify-center py-3">
                      <span className="text-xs text-slate-400">Beginning of conversation</span>
                    </div>
                  )}
                  {row.type === 'bottom' && (
                    <div className="flex justify-center py-3">
                      <span className="text-xs text-slate-400">End of conversation</span>
                    </div>
                  )}
                  {row.type === 'day' && (
                    <div className="px-4">
                      <DayHeader date={row.date} />
                    </div>
                  )}
                  {row.type === 'msg' && (
                    <div className="px-4">
                      <MessageRow
                        message={row.msg}
                        author={recipients[row.msg.author_id]}
                        quoteAuthor={row.msg.quote_author_id ? recipients[row.msg.quote_author_id] : null}
                        isAnchor={row.msg.id === anchorMessageId}
                        isGroup={isGroup}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
