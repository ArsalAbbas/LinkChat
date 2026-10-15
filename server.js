// Starts LinkChat. PORT picks the port (3000 by default). Set TRUST_PROXY=1 behind a proxy that
// sets X-Forwarded-For, so the limit on opening rooms counts each visitor, not the proxy.

import { createApp } from './src/app.js'

const port = Number(process.env.PORT ?? 3000)
const { server, close } = createApp({ trustProxy: process.env.TRUST_PROXY === '1' })

server.listen(port, () => console.log(`LinkChat is running at http://localhost:${port}`))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => close().then(() => process.exit(0)))
}
