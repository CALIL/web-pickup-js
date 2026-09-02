import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/api_calil.js';

// ブラウザ環境のモック。fetch と window だけあれば動く
let listeners = {};
globalThis.window = { addEventListener: (k, f) => { listeners[k] = f; } };
const ok = (body) => Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(e));
console.log = () => {};

beforeEach(() => { listeners = {}; unhandled.length = 0; });

test('fetch が reject し続けたら5回リトライ後に timeout で1回だけ callback を呼ぶ', async () => {
  let calls = 0; const cb = [];
  globalThis.fetch = () => { calls++; return Promise.reject(new TypeError('Failed to fetch')); };
  const c = new check('k', '1', 's', (d) => cb.push(d));
  c.pollingInterval = 1; // バックオフ 1,2,4,8,16ms
  await sleep(200);
  assert.equal(calls, 6);
  assert.equal(cb.length, 1);
  assert.equal(cb[0].status, 'timeout');
  assert.equal(cb[0].continue, 0);
  assert.equal(c.killed, true);
  assert.equal(unhandled.length, 0);
});

test('ポーリング途中で1回失敗して復帰すると結果が届き retryCount が 0 に戻る', async () => {
  let n = 0; const cb = [];
  globalThis.fetch = () => {
    n++;
    if (n === 1) return ok({ session: 'S', continue: 1, books: {} });
    if (n === 2) return Promise.reject(new TypeError('Failed to fetch'));
    return ok({ session: 'S', continue: 0, books: { '1': { s: { status: 'OK', libkey: { a: '貸出可' } } } } });
  };
  const c = new check('k', '1', 's', (d) => cb.push(d));
  c.pollingInterval = 1;
  await sleep(100);
  assert.equal(n, 3);
  assert.equal(cb.length, 2);
  assert.equal(cb[1].continue, 0);
  assert.equal(cb[1].status, undefined);
  assert.equal(c.retryCount, 0);
  assert.equal(unhandled.length, 0);
});

test('fetch が成功すれば従来どおり callback に本の状態が届く', async () => {
  const cb = [];
  globalThis.fetch = () => ok({ session: 'S', continue: 0, books: { '1': { s: { status: 'OK', libkey: { a: '貸出可' } } } } });
  new check('k', '1', 's', (d) => cb.push(d));
  await sleep(20);
  assert.equal(cb.length, 1);
  assert.equal(cb[0].books['1'].s.libkey.a, '貸出可');
  assert.equal(unhandled.length, 0);
});

test('pagehide 後は fetch が reject してもリトライしない', async () => {
  let calls = 0; const cb = [];
  globalThis.fetch = () => { calls++; return Promise.reject(new TypeError('x')); };
  const c = new check('k', '1', 's', (d) => cb.push(d));
  c.pollingInterval = 1;
  listeners.pagehide();
  await sleep(100);
  assert.equal(calls, 1);
  assert.equal(cb.length, 0);
  assert.equal(unhandled.length, 0);
});
