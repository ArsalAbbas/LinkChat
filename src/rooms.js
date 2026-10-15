// Rooms live in memory. Each one has a hard-to-guess id, the people in it right now, and its
// latest messages, so someone who joins late can catch up. A room nobody has been in for a day
// closes, and its link stops working.

import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const LIMITS = {
  /** characters in a room id: 62^10, so links can't be guessed */
  idLength: 10,
  /** messages a room keeps for people who join later */
  history: 200,
  /** characters in a message, and in a name */
  text: 2000,
  name: 32,
  /** people in one room at once */
  people: 100,
  /** how long an empty room stays open, in ms */
  idle: 24 * 60 * 60 * 1000,
}

export const isRoomId = (id) => typeof id === 'string' && new RegExp(`^[0-9A-Za-z]{${LIMITS.idLength}}$`).test(id)

/** A random id from ALPHABET, picked without bias. */
export function newId(length = LIMITS.idLength) {
  let id = ''
  while (id.length < length) {
    for (const byte of randomBytes(length)) {
      // 248 is the largest multiple of 62 under 256; bytes above it would favour the first letters
      if (byte < 248 && id.length < length) id += ALPHABET[byte % 62]
    }
  }
  return id
}

/** Trims a name, or a message, and says whether what's left is usable. */
export function clean(value, max) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\r\n?/g, '\n').trim()
  return text.length > 0 && text.length <= max ? text : ''
}

export class Rooms {
  #rooms = new Map()
  #now

  /** `now` is there so tests can move the clock */
  constructor({ now = () => Date.now() } = {}) {
    this.#now = now
  }

  get size() {
    return this.#rooms.size
  }

  create() {
    let id = newId()
    while (this.#rooms.has(id)) id = newId()
    this.#rooms.set(id, { id, people: new Map(), history: [], emptySince: this.#now() })
    return id
  }

  has(id) {
    return this.#rooms.has(id)
  }

  /** Adds someone to a room. Returns who they are, or null if the room is gone or full. */
  join(id, name, send) {
    const room = this.#rooms.get(id)
    if (!room || room.people.size >= LIMITS.people) return null
    const person = { id: newId(6), name, send }
    room.people.set(person.id, person)
    room.emptySince = null
    return person
  }

  leave(id, personId) {
    const room = this.#rooms.get(id)
    if (!room) return
    room.people.delete(personId)
    if (room.people.size === 0) room.emptySince = this.#now()
  }

  people(id) {
    const room = this.#rooms.get(id)
    return room ? [...room.people.values()].map(({ id, name }) => ({ id, name })) : []
  }

  history(id) {
    return this.#rooms.get(id)?.history ?? []
  }

  /** Keeps a message in the room's history, dropping the oldest past the limit. */
  record(id, message) {
    const room = this.#rooms.get(id)
    if (!room) return
    room.history.push(message)
    if (room.history.length > LIMITS.history) room.history.shift()
  }

  /** Sends an event to everyone in a room, except `skip` if given. */
  broadcast(id, event, skip) {
    const room = this.#rooms.get(id)
    if (!room) return
    const data = JSON.stringify(event)
    for (const person of room.people.values()) if (person.id !== skip) person.send(data)
  }

  /** Closes rooms that have been empty for longer than LIMITS.idle. Returns how many. */
  sweep() {
    let closed = 0
    for (const [id, room] of this.#rooms) {
      if (room.emptySince !== null && this.#now() - room.emptySince > LIMITS.idle) {
        this.#rooms.delete(id)
        closed++
      }
    }
    return closed
  }
}
