// A room: checks it exists, asks for your name once, then follows it live in the database: its
// messages, who's here, and who's typing. If the connection drops, Firebase reconnects on its own,
// and anything sent meanwhile goes out once it's back.

import {
  db,
  get,
  limitToLast,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  signIn,
  update,
} from './firebase.js'
import { LIMITS, clean, hue, isRoomId, linkParts, typingLine } from './util.js'

const roomId = location.pathname.split('/')[2] ?? ''
const NAME_KEY = 'linkchat:name'
const $ = (selector) => document.querySelector(selector)
const els = {
  status: $('[data-status]'),
  copy: $('[data-copy]'),
  log: $('[data-log]'),
  typing: $('[data-typing]'),
  composer: $('[data-composer]'),
  text: $('#text'),
  send: $('[data-composer] button'),
  people: $('[data-people]'),
  count: $('[data-count]'),
  rename: $('[data-rename]'),
  sheet: $('[data-name-sheet]'),
  nameInput: $('#name'),
  gone: $('[data-gone]'),
}
const at = (path) => ref(db, `${path}/${roomId}`)

let name = clean(localStorage.getItem(NAME_KEY), LIMITS.name) || null
let uid = null
/** this tab's entry under who's here */
let me = null
let unread = 0
let caughtUp = false
let connected = false
/** the server's clock minus this one, so typing can age out on the same clock it was stamped with */
let clockOffset = 0
/** who's here, by their id, as of the last look */
let people = new Map()
let seenPeople = false
const typing = new Map()

// ---------- following the room

function follow() {
  me = push(at('people'))
  // say you're here whenever the connection is up; Firebase takes it back when the connection drops
  onValue(ref(db, '.info/connected'), async (snap) => {
    if (!snap.val()) return setStatus(connected ? 'Reconnecting…' : 'Connecting…')
    connected = true
    setStatus('')
    await onDisconnect(me).remove()
    await set(me, { uid, name, at: serverTimestamp() })
  })
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => (clockOffset = snap.val() ?? 0))
  onValue(at('people'), (snap) => updatePeople(snap.val() ?? {}))
  onValue(at('typing'), (snap) => updateTyping(snap.val() ?? {}))

  const recent = query(at('messages'), limitToLast(LIMITS.history))
  onChildAdded(recent, (snap) => {
    const message = snap.val()
    clearTyping(message.uid)
    addMessage(snap.key, message)
    if (caughtUp && document.hidden && message.uid !== uid) setUnread(unread + 1)
  })
  // the oldest drops off as new ones come in, and a message the rules turned down is taken back
  onChildRemoved(recent, (snap) => els.log.querySelector(`[data-key="${snap.key}"]`)?.remove())
  // this fires once the history so far has arrived
  onValue(
    recent,
    () => {
      caughtUp = true
      els.log.dataset.ready = ''
      scrollDown(true)
    },
    { onlyOnce: true },
  )
  setComposer(true)
}

/** Compares who's here with last time, and says who came, went, or changed their name. */
function updatePeople(entries) {
  const next = new Map()
  for (const entry of Object.values(entries)) if (typeof entry?.uid === 'string') next.set(entry.uid, entry.name)
  if (seenPeople) {
    for (const [id, now] of next) {
      const before = people.get(id)
      if (before === undefined && id !== uid) addNote(`${now} joined`)
      else if (before !== undefined && before !== now) addNote(`${before} is now ${now}`)
    }
    for (const [id, before] of people) if (!next.has(id)) addNote(`${before} left`)
  }
  people = next
  seenPeople = true
  renderPeople()
}

function updateTyping(entries) {
  typing.clear()
  for (const [id, entry] of Object.entries(entries)) {
    if (id !== uid && entry?.name && typeof entry.at === 'number') typing.set(id, entry)
  }
  renderTyping()
}

function clearTyping(id) {
  if (typing.delete(id)) renderTyping()
}

// ---------- drawing

const nearBottom = () => els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80

function scrollDown(force = false) {
  if (force || nearBottom()) els.log.scrollTop = els.log.scrollHeight
}

function addMessage(key, message) {
  const stick = nearBottom()
  const previous = els.log.lastElementChild
  const li = document.createElement('li')
  li.className = 'message'
  li.dataset.key = key
  li.dataset.from = message.uid
  li.dataset.at = message.at
  li.style.setProperty('--hue', hue(message.uid))
  if (message.uid === uid) li.classList.add('message--mine')

  // a run of messages from one person shows their name once
  const sameRun = previous?.dataset.from === message.uid && message.at - Number(previous.dataset.at) < 5 * 60_000
  if (sameRun) {
    li.classList.add('message--more')
  } else {
    const head = document.createElement('p')
    head.className = 'message__head'
    const who = document.createElement('span')
    who.className = 'message__name'
    who.textContent = message.name
    const when = document.createElement('time')
    when.dateTime = new Date(message.at).toISOString()
    when.textContent = new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    head.append(who, when)
    li.append(head)
  }
  const body = document.createElement('p')
  body.className = 'message__text'
  // built from text nodes and links, never HTML
  for (const part of linkParts(message.text)) {
    if (!part.href) {
      body.append(part.text)
      continue
    }
    const a = document.createElement('a')
    a.href = part.href
    a.textContent = part.href
    a.target = '_blank'
    a.rel = 'noopener noreferrer nofollow'
    body.append(a)
  }
  li.append(body)
  els.log.append(li)
  scrollDown(stick || message.uid === uid)
}

function addNote(text) {
  const stick = nearBottom()
  const li = document.createElement('li')
  li.className = 'note'
  li.textContent = text
  els.log.append(li)
  scrollDown(stick)
}

function renderPeople() {
  const list = [...people].sort(([a, an], [b, bn]) => (a === uid ? -1 : b === uid ? 1 : an.localeCompare(bn)))
  els.people.replaceChildren(
    ...list.map(([id, personName]) => {
      const li = document.createElement('li')
      li.className = 'person'
      li.style.setProperty('--hue', hue(id))
      li.textContent = personName
      if (id === uid) {
        const you = document.createElement('span')
        you.className = 'person__you'
        you.textContent = ' (you)'
        li.append(you)
      }
      return li
    }),
  )
  els.count.textContent = `· ${people.size}`
}

function renderTyping() {
  // someone still typing says so every couple of seconds; after a few quiet ones they've stopped
  const now = Date.now() + clockOffset
  els.typing.textContent = typingLine([...typing.values()].filter((t) => now - t.at < 4000).map((t) => t.name))
}
setInterval(renderTyping, 1000)

function setStatus(text) {
  els.status.textContent = text
}

function setComposer(on) {
  els.text.disabled = !on
  els.send.disabled = !on
  if (on && matchMedia('(pointer: fine)').matches) els.text.focus()
}

function setUnread(count) {
  unread = count
  document.title = `${count ? `(${count}) ` : ''}A room on LinkChat`
}

function showGone() {
  document.body.classList.add('room--gone')
  els.gone.hidden = false
  document.title = 'Room not found · LinkChat'
}

// ---------- your name

function saveName(next) {
  name = next
  localStorage.setItem(NAME_KEY, next)
}

/** Opens the name sheet and resolves with what was typed, or '' if it was closed. */
function askName() {
  return new Promise((resolve) => {
    els.nameInput.value = name ?? ''
    els.sheet.addEventListener('close', () => resolve(els.sheet.returnValue === 'cancel' ? '' : clean(els.nameInput.value, LIMITS.name)), {
      once: true,
    })
    els.sheet.returnValue = 'cancel'
    els.sheet.showModal()
  })
}

// ---------- what you do

let lastTyping = 0
els.text.addEventListener('input', () => {
  // grow with what's typed, up to a point
  els.text.style.height = 'auto'
  // scrollHeight leaves out the border, which the box's height includes
  els.text.style.height = `${Math.min(els.text.scrollHeight + 2, 160)}px`
  if (!uid || !els.text.value || Date.now() - lastTyping < 2000) return
  lastTyping = Date.now()
  const mine = ref(db, `typing/${roomId}/${uid}`)
  onDisconnect(mine).remove()
  set(mine, { name, at: serverTimestamp() }).catch(() => {})
})

els.text.addEventListener('keydown', (e) => {
  // Enter sends, Shift+Enter starts a new line
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    els.composer.requestSubmit()
  }
})

els.composer.addEventListener('submit', (e) => {
  e.preventDefault()
  const text = clean(els.text.value, LIMITS.text)
  if (!text || !uid) return
  els.text.value = ''
  els.text.style.height = ''
  lastTyping = 0
  remove(ref(db, `typing/${roomId}/${uid}`)).catch(() => {})
  // the message and when you last sent one go together, so the rules can hold off a flood
  const key = push(at('messages')).key
  update(ref(db), {
    [`messages/${roomId}/${key}`]: { uid, name, text, at: serverTimestamp() },
    [`last/${uid}`]: serverTimestamp(),
  }).catch(() => {
    addNote('That didn’t send. Slow down a little, then try again.')
    if (!els.text.value) els.text.value = text
  })
})

els.copy.addEventListener('click', async () => {
  const label = 'Copy link'
  try {
    await navigator.clipboard.writeText(location.href)
    els.copy.textContent = 'Copied'
  } catch {
    els.copy.textContent = 'Copy it from the address bar'
  }
  setTimeout(() => (els.copy.textContent = label), 2000)
})

els.rename.addEventListener('click', async () => {
  const next = await askName()
  if (!next || next === name) return
  saveName(next)
  if (me) update(me, { name: next }).catch(() => {})
})

document.addEventListener('visibilitychange', () => document.hidden || setUnread(0))

// ---------- start

async function start() {
  try {
    uid = await signIn()
  } catch {
    return setStatus('Couldn’t connect. Check your connection and reload.')
  }
  const room = isRoomId(roomId) ? await get(at('rooms')).catch(() => null) : null
  if (!room?.exists()) return showGone()
  if (!name) saveName((await askName()) || 'Guest')
  follow()
}

start()
