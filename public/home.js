// The front page: asks the server for a new room and goes to it.

const start = document.querySelector('[data-start]')
const error = document.querySelector('[data-error]')

start.addEventListener('click', async () => {
  start.disabled = true
  error.hidden = true
  try {
    const res = await fetch('/api/rooms', { method: 'POST' })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error)
    location.assign(`/r/${body.id}`)
  } catch (e) {
    error.textContent = e.message || 'Couldn’t start a room. Try again.'
    error.hidden = false
    start.disabled = false
  }
})
