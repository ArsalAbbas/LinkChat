import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LIMITS, Rooms, clean, isRoomId, newId } from '../src/rooms.js'

test('room ids are random and the right shape', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()))
  assert.equal(ids.size, 1000)
  for (const id of ids) assert.ok(isRoomId(id), id)
  assert.ok(!isRoomId('short'))
  assert.ok(!isRoomId('../../etc/x'))
  assert.ok(!isRoomId(42))
})

test('clean trims, and refuses empty or long text', () => {
  assert.equal(clean('  hi \r\n there ', 20), 'hi \n there')
  assert.equal(clean('   ', 20), '')
  assert.equal(clean('x'.repeat(21), 20), '')
  assert.equal(clean({ text: 'hi' }, 20), '')
})

test('people join, hear each other, and leave', () => {
  const rooms = new Rooms()
  const id = rooms.create()
  const heard = { a: [], b: [] }
  const a = rooms.join(id, 'Ana', (data) => heard.a.push(JSON.parse(data)))
  const b = rooms.join(id, 'Ben', (data) => heard.b.push(JSON.parse(data)))
  assert.deepEqual(
    rooms.people(id).map((p) => p.name),
    ['Ana', 'Ben'],
  )

  rooms.broadcast(id, { type: 'hi' }, a.id)
  assert.equal(heard.a.length, 0)
  assert.deepEqual(heard.b, [{ type: 'hi' }])

  rooms.leave(id, b.id)
  assert.deepEqual(
    rooms.people(id).map((p) => p.name),
    ['Ana'],
  )
})

test('joining a room that is gone, or full, gives nothing', () => {
  const rooms = new Rooms()
  assert.equal(rooms.join('AAAAAAAAAA', 'Ana', () => {}), null)
  const id = rooms.create()
  for (let i = 0; i < LIMITS.people; i++) assert.ok(rooms.join(id, `P${i}`, () => {}))
  assert.equal(rooms.join(id, 'One more', () => {}), null)
})

test('history keeps only the latest messages', () => {
  const rooms = new Rooms()
  const id = rooms.create()
  for (let i = 0; i < LIMITS.history + 5; i++) rooms.record(id, { text: String(i) })
  const history = rooms.history(id)
  assert.equal(history.length, LIMITS.history)
  assert.equal(history[0].text, '5')
  assert.equal(history.at(-1).text, String(LIMITS.history + 4))
})

test('a room closes a day after the last person leaves, not while someone is in it', () => {
  let now = 0
  const rooms = new Rooms({ now: () => now })
  const empty = rooms.create()
  const busy = rooms.create()
  const person = rooms.join(busy, 'Ana', () => {})

  now = LIMITS.idle - 1
  assert.equal(rooms.sweep(), 0)
  now = LIMITS.idle + 1
  assert.equal(rooms.sweep(), 1)
  assert.ok(!rooms.has(empty))
  assert.ok(rooms.has(busy))

  rooms.leave(busy, person.id)
  now += LIMITS.idle + 1
  assert.equal(rooms.sweep(), 1)
  assert.equal(rooms.size, 0)
})
