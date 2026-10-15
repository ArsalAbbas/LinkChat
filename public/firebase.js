// Connects to Firebase. The Realtime Database holds the rooms and keeps every open page in sync,
// and anonymous sign-in gives each browser an id the database rules can check. This config is
// meant to be public: the rules in database.rules.json are what decide who can read and write.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'
import { getDatabase } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js'

export {
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
  update,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js'

const app = initializeApp({
  apiKey: 'AIzaSyDidkr9MYYQCnCymWmBXfs9P3zY6XCyJsA',
  authDomain: 'chat-app-37dc4.firebaseapp.com',
  databaseURL: 'https://chat-app-37dc4-default-rtdb.firebaseio.com',
  projectId: 'chat-app-37dc4',
  appId: '1:742119306474:web:a4f4e05adf4d9b3e74d393',
})

export const db = getDatabase(app)
// set up by hand rather than with getAuth, which also loads Google's sign-in popups this never uses
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })

/** Signs this browser in without an account (the same one each visit) and gives back its id. */
export const signIn = () => signInAnonymously(auth).then((credential) => credential.user.uid)
