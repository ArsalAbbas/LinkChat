# LinkChat

Chat rooms that live at a link. Start a room, send its link to whoever you want in it, and talk.

**Try it:** https://linkchat-2598e.web.app

- No accounts. You pick a name when you join, and the browser remembers it.
- Anyone with the link can get in. Room links are 10 random letters and digits, so they can't be guessed.
- A room keeps its messages, and shows the last 200 to whoever joins later.
- Typing indicators, who's here, links in messages you can click, and light and dark themes.

I started this in 2023 and finished it in 2026.

## How it works

The pages are plain HTML, CSS and JavaScript in [`public/`](public), with no build step. They talk to [Firebase](https://firebase.google.com):

- **Realtime Database** holds the rooms and keeps every open page in sync. Each room has its messages, who's here, and who's typing.
- **Anonymous sign-in** gives each browser an id without an account, so the database can tell people apart.
- **Hosting** serves the pages, and sends every `/r/<id>` link to the room page.

Who's here comes from each open page adding itself to the room, and Firebase taking it off again when the connection drops.

[`database.rules.json`](database.rules.json) decides what anyone can read and write. Rooms can't be listed, only opened by their link. Nobody can edit or delete a message, or send one under someone else's id. Messages are up to 2,000 characters, and each person can send one every half second.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer. There's nothing to install.

```sh
git clone https://github.com/ArsalAbbas/LinkChat.git
cd LinkChat
npm start
```

Then open http://localhost:3000, start a room, and open its link in a second window to talk to yourself. `PORT=4000 npm start` runs it on another port.

The pages on your machine use the same database as the live site. To use your own, see below.

```sh
npm test
```

## Your own copy

1. Make a project in the [Firebase console](https://console.firebase.google.com).
2. In it, create a Realtime Database, and turn on Anonymous under Authentication → Sign-in method.
3. Add a web app, and put its config in [`public/firebase.js`](public/firebase.js).
4. Put your project id in `.firebaserc`, and your Hosting site in `firebase.json`.
5. Run `npx firebase-tools login`, then `npm run deploy`.

## License

[MIT](LICENSE)
