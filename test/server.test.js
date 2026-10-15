import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import WebSocket from 'ws'
import { createApp } from '../src/app.js'

let app
let base

before(async () => {
  app = createApp()
  app.server.listen(0)
  await once(app.server, 'listening')
  base = `http://localhost:${app.server.address().port}`
})

after(() => app.close())

const openRoom = async () => (await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()).id

/** A socket in a room that keeps every event it gets, and can wait for the next of a type. */
function join(id, name) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${id}`)
  const events = []
  const waiting = []
  ws.on('message', (raw) => {
    const event = JSON.parse(String(raw))
    events.push(event)
    for (const w of waiting.filter((w) => w.type === event.type)) {
      waiting.splice(waiting.indexOf(w), 1)
      w.resolve(event)
    }
  })
  ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', name })))
  const next = (type) => new Promise((resolve) => waiting.push({ type, resolve }))
  return { ws, events, next, say: (event) => ws.send(JSON.stringify(event)) }
}

test('the pages are there, and a room that does not exist is a 404', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200)
  assert.equal((await fetch(`${base}/style.css`)).status, 200)
  assert.equal((await fetch(`${base}/r/AAAAAAAAAA`)).status, 404)
  assert.equal((await fetch(`${base}/r/${await openRoom()}`)).status, 200)
  // only the files it knows about, never anything else on disk
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404)
  assert.equal((await fetch(`${base}/room.html`)).status, 404)
})

test('two people in a room hear each other', async () => {
  const id = await openRoom()
  const ana = join(id, 'Ana')
  const welcomeAna = await ana.next('welcome')
  assert.equal(welcomeAna.you.name, 'Ana')

  const joined = ana.next('joined')
  const ben = join(id, '  Ben  ')
  const welcomeBen = await ben.next('welcome')
  assert.equal(welcomeBen.you.name, 'Ben')
  assert.deepEqual(welcomeBen.people.map((p) => p.name).sort(), ['Ana', 'Ben'])
  assert.equal((await joined).person.name, 'Ben')

  const heard = ben.next('message')
  ana.say({ type: 'say', text: 'hello <b>there</b>' })
  const message = await heard
  assert.equal(message.text, 'hello <b>there</b>')
  assert.equal(message.from.name, 'Ana')

  // someone who comes in later sees what was said
  const cal = join(id, 'Cal')
  assert.deepEqual(
    (await cal.next('welcome')).history.map((m) => m.text),
    ['hello <b>there</b>'],
  )

  const left = ana.next('left')
  ben.ws.close()
  assert.equal((await left).person.name, 'Ben')
  for (const p of [ana, cal]) p.ws.close()
})

test('names can change, and empty messages go nowhere', async () => {
  const id = await openRoom()
  const ana = join(id, 'Ana')
  await ana.next('welcome')
  const renamed = ana.next('renamed')
  ana.say({ type: 'say', text: '   ' })
  ana.say({ type: 'rename', name: 'Anna' })
  assert.equal((await renamed).person.name, 'Anna')
  assert.equal(ana.events.filter((e) => e.type === 'message').length, 0)
  ana.ws.close()
})

test('a socket for a room that does not exist is closed with 4404', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=AAAAAAAAAA`)
  const [code] = await once(ws, 'close')
  assert.equal(code, 4404)
})

test('someone talking too fast is asked to slow down', async () => {
  const id = await openRoom()
  const ana = join(id, 'Ana')
  await ana.next('welcome')
  const slow = ana.next('error')
  for (let i = 0; i < 12; i++) ana.say({ type: 'say', text: `#${i}` })
  assert.match((await slow).text, /slow down/i)
  ana.ws.close()
})
