'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatHub, applyFilter, maskWord } = require('../lib/chat');
const { Store } = require('../lib/store');

function hub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-chat-'));
  return new ChatHub(new Store(dir));
}

test('word masking keeps first and last letter', () => {
  assert.strictEqual(maskWord('cunt'), 'c**t');
  assert.strictEqual(maskWord('shit'), 's**t');
  assert.strictEqual(maskWord('no'), '**');
});

test('filter masks whole words case-insensitively, leaves the rest', () => {
  const words = ['cunt', 'shit'];
  assert.strictEqual(applyFilter('what a CUNT move', words), 'what a C**T move');
  assert.strictEqual(applyFilter('this is shit.', words), 'this is s**t.');
  assert.strictEqual(applyFilter('scunthorpe is fine', words), 'scunthorpe is fine');
  assert.strictEqual(applyFilter('all clean here', words), 'all clean here');
});

test('posting applies the filter and enforces rate limit', () => {
  const h = hub();
  const first = h.post('show1', { name: 'Sam', text: 'total bullshit', ip: '1.2.3.4' });
  assert.ok(first.ok);
  assert.strictEqual(h.recent('show1')[0].text, 'total b******t');
  const second = h.post('show1', { name: 'Sam', text: 'again', ip: '1.2.3.4' });
  assert.strictEqual(second.status, 429);
  const other = h.post('show1', { name: 'Ada', text: 'hello', ip: '5.6.7.8' });
  assert.ok(other.ok);
});

test('banning by message removes the sender and blocks future posts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-chat-'));
  const h = new ChatHub(new Store(dir), { postIntervalMs: 0 });
  const posted = h.post('show1', { name: 'Troll', text: 'bye', ip: '9.9.9.9' });
  assert.ok(posted.ok);
  assert.ok(h.banBySender('show1', posted.id, 'test'));
  assert.strictEqual(h.recent('show1').length, 0);
  const again = h.post('show1', { name: 'Troll', text: 'back', ip: '9.9.9.9' });
  assert.strictEqual(again.status, 403);
  h.unbanIp('9.9.9.9');
  const after = h.post('show1', { name: 'Troll', text: 'reformed', ip: '9.9.9.9' });
  assert.ok(after.ok);
});

test('messages never expose IPs to viewers', () => {
  const h = hub();
  h.post('show1', { name: 'Sam', text: 'hi', ip: '1.2.3.4' });
  const view = h.recent('show1')[0];
  assert.strictEqual(view.ip, undefined);
  assert.deepStrictEqual(Object.keys(view).sort(), ['at', 'id', 'name', 'text', 'type']);
});
