import React from 'react'

export default function MessageRow({ message: msg, author, quoteAuthor, isAnchor, isGroup }) {
  const isOutgoing     = msg.direction === 'outgoing'
  const isDirectionless = msg.direction === 'directionless'
  const isSystem       = msg.kind === 'update'

  if (isSystem || isDirectionless) {
    return (
      <div className={`flex justify-center my-1 ${isAnchor ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}>
        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
          {displayBody(msg)}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex my-0.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[72%] ${isAnchor ? 'ring-2 ring-blue-400 rounded-2xl' : ''}`}>
        {/* Author name for incoming group messages */}
        {!isOutgoing && !!isGroup && author && (
          <div className="text-xs font-medium text-slate-500 mb-0.5 ml-3">
            {author.display_name}
          </div>
        )}

        <div className={`rounded-2xl px-3.5 py-2 text-sm ${
          isOutgoing
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-900 rounded-bl-sm'
        }`}>
          {/* Quote */}
          {!!msg.has_quote && (
            <div className={`mb-2 pl-2 border-l-2 text-xs ${
              isOutgoing ? 'border-blue-300 text-blue-100' : 'border-slate-300 text-slate-500'
            }`}>
              {quoteAuthor && (
                <div className="font-medium mb-0.5">{quoteAuthor.display_name}</div>
              )}
              <div className="line-clamp-2">{msg.quote_body || '…'}</div>
            </div>
          )}

          {/* Body */}
          <div className="whitespace-pre-wrap break-words leading-snug">
            {displayBody(msg)}
          </div>
        </div>

        {/* Timestamp */}
        <div className={`text-[10px] text-slate-400 mt-0.5 ${isOutgoing ? 'text-right mr-1' : 'ml-1'}`}>
          {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

function displayBody(msg) {
  if (msg.body)        return msg.body
  if (msg.update_text) return msg.update_text
  switch (msg.kind) {
    case 'sticker':        return '[sticker]'
    case 'remote_deleted': return '[deleted]'
    case 'view_once':      return '[view-once media]'
    case 'contact_share':  return '[shared contact]'
    case 'payment':        return '[payment]'
    case 'gift':           return '[gift]'
    default:               return '[attachment]'
  }
}

export function DayHeader({ date }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
        {new Date(date).toLocaleDateString(undefined, {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}
      </span>
    </div>
  )
}
