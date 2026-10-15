// The front page: makes a new room in the database and goes to it.

import { db, ref, serverTimestamp, set, signIn } from './firebase.js'
import { newId } from './util.js'

const start = document.querySelector('[data-start]')
const error = document.querySelector('[data-error]')

start.addEventListener('click', async () => {
  start.disabled = true
  error.hidden = true
  try {
    const uid = await signIn()
    const id = newId()
    // the rules only let a room be written once, so this can't take over someone else's
    await set(ref(db, `rooms/${id}`), { createdAt: serverTimestamp(), createdBy: uid })
    location.assign(`/r/${id}`)
  } catch {
    error.textContent = 'Couldn’t start a room. Check your connection and try again.'
    error.hidden = false
    start.disabled = false
  }
})
