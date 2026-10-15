// Small pieces with no Firebase in them, shared by the pages and checked by the tests.

export const LIMITS = {
  /** characters in a room id: 62^10 of them, so links can't be guessed */
  idLength: 10,
  /** messages a room shows, for people who join later */
  history: 200,
  /** characters in a message, and in a name */
  text: 2000,
  name: 32,
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const isRoomId = (id) => typeof id === 'string' && /^[0-9A-Za-z]{10}$/.test(id)

/** A random id from ALPHABET, picked without bias. */
export function newId(length = LIMITS.idLength) {
  let id = ''
  while (id.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
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

/** A colour for each person, the same every time they show up. */
export function hue(id) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** Splits a message into plain text and web addresses, so the page can make links without HTML. */
export function linkParts(text) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]']/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ href: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

export function typingLine(names) {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}
