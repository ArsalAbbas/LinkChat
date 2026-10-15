import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LIMITS, clean, hue, isRoomId, linkParts, newId, typingLine } from '../public/util.js'

test('room ids are 10 letters and digits, and differ', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()))
  assert.equal(ids.size, 500)
  for (const id of ids) assert.ok(isRoomId(id), id)
})

test('only well-formed room ids pass', () => {
  assert.ok(isRoomId('aB3dE5gH7j'))
  for (const id of ['', 'short', 'aB3dE5gH7jK', 'aB3dE5gH7-', '../secret', null, 1234567890]) assert.ok(!isRoomId(id), String(id))
})

test('clean trims, and gives back nothing when there is nothing to send or too much', () => {
  assert.equal(clean('  hi  ', LIMITS.name), 'hi')
  assert.equal(clean('a\r\nb', LIMITS.text), 'a\nb')
  assert.equal(clean('   ', LIMITS.name), '')
  assert.equal(clean('x'.repeat(LIMITS.name + 1), LIMITS.name), '')
  assert.equal(clean(undefined, LIMITS.name), '')
})

test('a person keeps their colour', () => {
  assert.equal(hue('abc'), hue('abc'))
  assert.ok(hue('abc') >= 0 && hue('abc') < 360)
})

test('links are split out of messages, without trailing punctuation', () => {
  assert.deepEqual(linkParts('see https://example.com/a?b=1, then'), [
    { text: 'see ' },
    { href: 'https://example.com/a?b=1' },
    { text: ', then' },
  ])
  assert.deepEqual(linkParts('(http://x.io)'), [{ text: '(' }, { href: 'http://x.io' }, { text: ')' }])
  assert.deepEqual(linkParts('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }])
  assert.deepEqual(linkParts('no links'), [{ text: 'no links' }])
})

test('the typing line names one or two people, then stops counting', () => {
  assert.equal(typingLine([]), '')
  assert.equal(typingLine(['Ana']), 'Ana is typing…')
  assert.equal(typingLine(['Ana', 'Ben']), 'Ana and Ben are typing…')
  assert.equal(typingLine(['Ana', 'Ben', 'Cal']), 'Several people are typing…')
})
