// A room: asks for your name once, then keeps a WebSocket open to the room and draws what comes
// over it. If the connection drops it comes back on its own, unless the room has closed.

const roomId = location.pathname.split('/')[2]
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

let name = localStorage.getItem(NAME_KEY)
let ws = null
let me = null
let retries = 0
let unread = 0
const people = new Map()
const typing = new Map()

// ---------- talking to the server

function connect() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${scheme}://${location.host}/ws?room=${encodeURIComponent(roomId)}`)
  ws.addEventListener('open', () => send({ type: 'hello', name }))
  ws.addEventListener('message', (e) => receive(JSON.parse(e.data)))
  ws.addEventListener('close', (e) => {
    me = null
    setComposer(false)
    if (e.code === 4404) return showGone()
    if (e.code === 4429) return setStatus('This room is full. Try again later.')
    const wait = Math.min(1000 * 2 ** retries++, 15_000)
    setStatus('Reconnecting…')
    setTimeout(connect, wait)
  })
}

function send(event) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event))
}

function receive(event) {
  switch (event.type) {
    case 'welcome':
      retries = 0
      me = event.you
      people.clear()
      for (const person of event.people) people.set(person.id, person)
      // a reconnect sends the whole history again, so start the log over
      els.log.replaceChildren()
      for (const message of event.history) addMessage(message)
      renderPeople()
      setStatus('')
      setComposer(true)
      scrollDown(true)
      break
    case 'message':
      clearTyping(event.from.id)
      addMessage(event)
      if (document.hidden) setUnread(unread + 1)
      break
    case 'joined':
      people.set(event.person.id, event.person)
      addNote(`${event.person.name} joined`)
      renderPeople()
      break
    case 'left':
      people.delete(event.person.id)
      clearTyping(event.person.id)
      addNote(`${event.person.name} left`)
      renderPeople()
      break
    case 'renamed': {
      const before = people.get(event.person.id)?.name
      people.set(event.person.id, event.person)
      if (event.person.id === me?.id) me.name = event.person.name
      addNote(`${before ?? 'Someone'} is now ${event.person.name}`)
      renderPeople()
      break
    }
    case 'typing':
      showTyping(event.person)
      break
    case 'error':
      addNote(event.text)
      break
  }
}

// ---------- drawing

const nearBottom = () => els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80

function scrollDown(force = false) {
  if (force || nearBottom()) els.log.scrollTop = els.log.scrollHeight
}

/** A colour for each person, the same every time they show up. */
function hue(id) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** Message text, with web addresses made into links. Built from text nodes, never HTML. */
function linkify(text) {
  const out = document.createDocumentFragment()
  let last = 0
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]']/g)) {
    out.append(text.slice(last, match.index))
    const a = document.createElement('a')
    a.href = match[0]
    a.textContent = match[0]
    a.target = '_blank'
    a.rel = 'noopener noreferrer nofollow'
    out.append(a)
    last = match.index + match[0].length
  }
  out.append(text.slice(last))
  return out
}

function addMessage(message) {
  const stick = nearBottom()
  const previous = els.log.lastElementChild
  const li = document.createElement('li')
  li.className = 'message'
  li.dataset.from = message.from.id
  li.style.setProperty('--hue', hue(message.from.id))
  if (message.from.id === me?.id) li.classList.add('message--mine')

  // a run of messages from one person shows their name once
  const sameRun = previous?.dataset.from === message.from.id && message.at - Number(previous.dataset.at) < 5 * 60_000
  li.dataset.at = message.at
  if (!sameRun) {
    const head = document.createElement('p')
    head.className = 'message__head'
    const who = document.createElement('span')
    who.className = 'message__name'
    who.textContent = message.from.name
    const when = document.createElement('time')
    when.dateTime = new Date(message.at).toISOString()
    when.textContent = new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    head.append(who, when)
    li.append(head)
  } else {
    li.classList.add('message--more')
  }
  const body = document.createElement('p')
  body.className = 'message__text'
  body.append(linkify(message.text))
  li.append(body)
  els.log.append(li)
  scrollDown(stick || message.from.id === me?.id)
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
  const list = [...people.values()].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)))
  els.people.replaceChildren(
    ...list.map((person) => {
      const li = document.createElement('li')
      li.className = 'person'
      li.style.setProperty('--hue', hue(person.id))
      li.textContent = person.name
      if (person.id === me?.id) {
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

function showTyping(person) {
  clearTimeout(typing.get(person.id)?.timer)
  typing.set(person.id, { name: person.name, timer: setTimeout(() => clearTyping(person.id), 3500) })
  renderTyping()
}

function clearTyping(id) {
  clearTimeout(typing.get(id)?.timer)
  if (typing.delete(id)) renderTyping()
}

function renderTyping() {
  const names = [...typing.values()].map((t) => t.name)
  els.typing.textContent =
    names.length === 0 ? '' : names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…'
}

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
    els.sheet.addEventListener('close', () => resolve(els.sheet.returnValue === 'cancel' ? '' : els.nameInput.value.trim()), { once: true })
    els.sheet.returnValue = 'cancel'
    els.sheet.showModal()
  })
}

// ---------- what you do

let lastTyping = 0
els.text.addEventListener('input', () => {
  // grow with what's typed, up to a point
  els.text.style.height = 'auto'
  els.text.style.height = `${Math.min(els.text.scrollHeight, 160)}px`
  if (els.text.value && Date.now() - lastTyping > 2000) {
    lastTyping = Date.now()
    send({ type: 'typing' })
  }
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
  const text = els.text.value.trim()
  if (!text || !me) return
  send({ type: 'say', text })
  els.text.value = ''
  els.text.style.height = 'auto'
  lastTyping = 0
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
  send({ type: 'rename', name: next })
})

document.addEventListener('visibilitychange', () => document.hidden || setUnread(0))

// ---------- start

async function start() {
  // check the room is there before asking for a name
  const res = await fetch(location.pathname, { method: 'HEAD' }).catch(() => null)
  if (res?.status === 404) return showGone()
  if (!name) saveName((await askName()) || 'Guest')
  connect()
}

start()
