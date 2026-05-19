const express = require('express')
const path = require('path')
const fs = require('fs')
const ArchiveDB = require('./db')

function createApp(db, { isElectron = false, openDbCallback = null } = {}) {
  const app = express()
  app.use(express.json())

  app.get('/api/info', (req, res) => {
    try { res.json(db.getInfo()) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/conversations', (req, res) => {
    try { res.json(db.getConversations()) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/conversations/:id/messages', (req, res) => {
    try {
      const convId = parseInt(req.params.id)
      const { anchorId, before, after, limit, direction, refId, refTs } = req.query
      if (direction === 'before' && refId && refTs) {
        res.json(db.getMessagesBefore(convId, parseInt(refTs), parseInt(refId), parseInt(limit) || 100))
      } else if (direction === 'after' && refId && refTs) {
        res.json(db.getMessagesAfter(convId, parseInt(refTs), parseInt(refId), parseInt(limit) || 100))
      } else {
        res.json(db.getMessages(convId, {
          anchorId: anchorId ? parseInt(anchorId) : null,
          before:   parseInt(before)  || 80,
          after:    parseInt(after)   || 80,
          limit:    parseInt(limit)   || 120,
        }))
      }
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/search', (req, res) => {
    try {
      const { q, convId, authorId, startMs, endMs } = req.query
      if (!q) return res.json([])
      res.json(db.search(q, {
        convId:   convId   ? parseInt(convId)   : null,
        authorId: authorId ? parseInt(authorId) : null,
        startMs:  startMs  ? parseInt(startMs)  : null,
        endMs:    endMs    ? parseInt(endMs)    : null,
      }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/recipients', (req, res) => {
    try { res.json(db.getRecipients()) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/stats/:convId', (req, res) => {
    try { res.json(db.getStats(parseInt(req.params.convId))) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  if (isElectron && openDbCallback) {
    app.post('/api/open-db', async (req, res) => {
      const newPath = await openDbCallback()
      res.json({ path: newPath || null })
    })
  }

  // Serve built frontend if dist/ exists (production / Electron)
  const distPath = path.join(__dirname, '../../dist')
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
  }

  return app
}

function startServer(dbPath, port = 8080, options = {}) {
  const db = new ArchiveDB(dbPath)
  const app = createApp(db, options)
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, db })
    })
    server.on('error', reject)
  })
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const getArg = flag => {
    const i = args.indexOf(flag)
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null
  }
  const port   = parseInt(getArg('--port') || process.env.PORT   || '8080')
  const dbPath = getArg('--db')            || process.env.DB_PATH

  if (!dbPath) {
    console.error('Error: provide --db <path.sqlite> or set DB_PATH env var')
    process.exit(1)
  }

  startServer(dbPath, port).then(({ port }) => {
    console.log(`Signal Archive running on http://localhost:${port}`)
  }).catch(err => {
    console.error('Failed to start:', err.message)
    process.exit(1)
  })
}

module.exports = { startServer }
