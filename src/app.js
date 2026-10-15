// The server: the pages, an endpoint that opens a room, and a WebSocket per person in a room.
//
// What goes over the socket, as JSON:
//   you send     hello {name} first, then say {text}, typing, rename {name}
//   you receive  welcome {you, people, history}, message, joined, left, typing, renamed, error
// A socket for a room that doesn't exist is closed with code 4404, a full room with 4429.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { LIMITS, Rooms, clean, isRoomId, newId } from './rooms.js'

const PUBLIC = new URL('../public/', import.meta.url)
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml' }

/** The only files the server hands out, read once, so no path can reach anything else. */
function loadFiles() {
  const files = new Map()
  for (const name of ['index.html', 'room.html', 'style.css', 'home.js', 'room.js', 'favicon.svg']) {
    files.set(name, { type: TYPES[name.split('.').pop()], body: readFileSync(new URL(name, PUBLIC)) })
  }
  return files
}

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  // a room's link is its key, so it never goes out in a Referer header
  'Referrer-Policy': 'no-referrer',
}

/** Allows `count` actions per `ms`, per key. */
function limiter(count, ms) {
  const hits = new Map()
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < ms)
    const ok = recent.length < count
    if (ok) recent.push(now)
    hits.set(key, recent)
    if (hits.size > 10_000) hits.clear()
    return ok
  }
}

export function createApp({ rooms = new Rooms(), trustProxy = false } = {}) {
  const files = loadFiles()
  const opening = limiter(20, 10 * 60 * 1000)
  const clientIp = (req) => (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress

  function serve(res, name, status = 200) {
    const file = files.get(name)
    res.writeHead(status, { 'Content-Type': file.type, 'Cache-Control': 'no-cache', ...HEADERS })
    res.end(file.body)
  }
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...HEADERS })
    res.end(JSON.stringify(body))
  }

  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'POST' && pathname === '/api/rooms') {
      if (!opening(clientIp(req))) return json(res, 429, { error: 'Too many new rooms. Try again in a few minutes.' })
      return json(res, 201, { id: rooms.create() })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' })
    if (pathname === '/') return serve(res, 'index.html')
    if (pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size })
    const room = pathname.match(/^\/r\/([^/]+)\/?$/)
    if (room) return serve(res, 'room.html', isRoomId(room[1]) && rooms.has(room[1]) ? 200 : 404)
    const name = pathname.slice(1)
    if (files.has(name) && !name.endsWith('.html')) return serve(res, name)
    serve(res, 'index.html', 404)
  })

  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') return socket.destroy()
    sockets.handleUpgrade(req, socket, head, (ws) => connect(ws, url.searchParams.get('room') ?? ''))
  })

  function connect(ws, roomId) {
    if (!isRoomId(roomId) || !rooms.has(roomId)) return ws.close(4404, 'No such room')
    const send = (data) => ws.readyState === ws.OPEN && ws.send(data)
    const reply = (event) => send(JSON.stringify(event))
    const talking = limiter(10, 10 * 1000)
    let person = null
    let lastTyping = 0
    ws.alive = true
    ws.on('pong', () => (ws.alive = true))

    // say who you are within ten seconds
    const wait = setTimeout(() => person || ws.close(4400, 'Say hello first'), 10_000)

    ws.on('message', (raw) => {
      let event
      try {
        event = JSON.parse(String(raw))
      } catch {
        return reply({ type: 'error', text: 'That wasn’t a message the server understands.' })
      }
      if (!person) {
        if (event?.type !== 'hello') return
        person = rooms.join(roomId, clean(event.name, LIMITS.name) || 'Guest', send)
        if (!person) return ws.close(rooms.has(roomId) ? 4429 : 4404, rooms.has(roomId) ? 'Room is full' : 'No such room')
        clearTimeout(wait)
        reply({ type: 'welcome', you: { id: person.id, name: person.name }, people: rooms.people(roomId), history: rooms.history(roomId) })
        rooms.broadcast(roomId, { type: 'joined', person: { id: person.id, name: person.name } }, person.id)
        return
      }
      if (event?.type === 'say') {
        const text = clean(event.text, LIMITS.text)
        if (!text) return
        if (!talking(person.id)) return reply({ type: 'error', text: 'Slow down a little.' })
        const message = { type: 'message', id: newId(8), from: { id: person.id, name: person.name }, text, at: Date.now() }
        rooms.record(roomId, message)
        rooms.broadcast(roomId, message)
      } else if (event?.type === 'typing') {
        const now = Date.now()
        if (now - lastTyping < 2000) return
        lastTyping = now
        rooms.broadcast(roomId, { type: 'typing', person: { id: person.id, name: person.name } }, person.id)
      } else if (event?.type === 'rename') {
        const name = clean(event.name, LIMITS.name)
        if (!name || name === person.name) return
        person.name = name
        rooms.broadcast(roomId, { type: 'renamed', person: { id: person.id, name } })
      }
    })

    ws.on('close', () => {
      clearTimeout(wait)
      if (!person) return
      rooms.leave(roomId, person.id)
      rooms.broadcast(roomId, { type: 'left', person: { id: person.id, name: person.name } })
    })
  }

  // drop connections that stopped answering, and close rooms that have sat empty for a day
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!ws.alive) ws.terminate()
      else ((ws.alive = false), ws.ping())
    }
  }, 30_000)
  const sweep = setInterval(() => rooms.sweep(), 10 * 60 * 1000)
  heartbeat.unref()
  sweep.unref()

  return {
    server,
    rooms,
    close() {
      clearInterval(heartbeat)
      clearInterval(sweep)
      for (const ws of sockets.clients) ws.terminate()
      sockets.close()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}
