# LinkChat

Chat rooms that live at a link. Start a room, send its link to whoever you want in it, and talk.

- No accounts. You pick a name when you join, and the browser remembers it.
- Anyone with the link can get in. Room links are 10 random letters and digits, so they can't be guessed.
- Nothing is written to disk. A room keeps its last 200 messages for people who join late, and closes a day after the last person leaves.
- Typing indicators, who's here, links in messages you can click, and light and dark themes.

I started this in 2023 and finished it in 2026.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
git clone https://github.com/ArsalAbbas/LinkChat.git
cd LinkChat
npm install
npm start
```

Then open http://localhost:3000, start a room, and open its link in a second window to talk to yourself.
`PORT=4000 npm start` runs it on another port.

```sh
npm test
```

## How it works

A small Node server with one dependency, [`ws`](https://github.com/websockets/ws).

- `POST /api/rooms` opens a room and returns its id. The room's page is `/r/<id>`.
- The page opens a WebSocket to `/ws?room=<id>` and says hello with a name. Everything after that is JSON events over that socket:
  - you send `say`, `typing` and `rename`
  - you get `welcome` (who you are, who's here, the history so far), then `message`, `joined`, `left`, `typing` and `renamed`
- If the connection drops, the page reconnects on its own. A room that has closed answers with close code `4404`, and the page says so.

Rooms live in memory, in [`src/rooms.js`](src/rooms.js). The server is [`src/app.js`](src/app.js), and the pages are plain HTML, CSS and JavaScript in [`public/`](public).

There are limits so one person can't flood a room: messages up to 2,000 characters, 10 messages per 10 seconds, 100 people per room, and 20 new rooms per 10 minutes from one address.

## Putting it online

Any host that runs a long-lived Node process and allows WebSockets will do. Serverless functions won't, because the rooms live in the server's memory.
Run it behind HTTPS so the socket is `wss://`. If a proxy sits in front and sets `X-Forwarded-For`, start it with `TRUST_PROXY=1` so the limit on new rooms counts each visitor rather than the proxy.

Because rooms are in memory, restarting the server closes every room, and it runs as a single process.

## License

[MIT](LICENSE)
