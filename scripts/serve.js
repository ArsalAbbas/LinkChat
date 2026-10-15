// Serves public/ the way Firebase Hosting does, for trying LinkChat on your own machine: room links
// go to room.html, and the pages get the same headers as in firebase.json. The rooms themselves
// still live in the Firebase project the pages connect to.

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('../public/', import.meta.url).pathname
const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'))
const headers = Object.fromEntries(config.hosting.headers[0].headers.map(({ key, value }) => [key, value]))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

/** Where a path is in public/, like Hosting's cleanUrls and rewrites. */
function fileFor(pathname) {
  if (pathname === '/') return 'index.html'
  if (/^\/r\/[^/]+$/.test(pathname)) return 'room.html'
  const file = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
  return extname(file) ? file : `${file}.html`
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  const file = fileFor(pathname)
  try {
    if (file.startsWith('..')) throw new Error('outside public/')
    const body = await readFile(join(root, file))
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { ...headers, 'Content-Type': types['.html'] })
    res.end(await readFile(join(root, '404.html')))
  }
})

const port = Number(process.env.PORT) || 3000
server.listen(port, () => console.log(`LinkChat on http://localhost:${port}`))
