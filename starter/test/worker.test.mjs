import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../worker.mjs';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const photo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg';
function fixture(overrides = {}) {
  const calls = [];
  const bucket = {
    list: async (...args) => { calls.push(['list', ...args]); return {data: [{name: photo, created_at: '2026-01-01'}]}; },
    upload: async (...args) => { calls.push(['upload', ...args]); return {}; },
    download: async (...args) => { calls.push(['download', ...args]); return {data: new Blob([new Uint8Array([255,216,255,217])])}; }
  };
  const handler = createHandler((url, key, opts) => {
    calls.push(['client', url, key, opts]);
    return {auth: {
      getUser: async token => token === 'valid' ? {data: {user: {id: owner}}} : {error: true},
      signInWithPassword: async () => ({data: {session: {access_token: 'valid', refresh_token: 'never-return-this'}}})
    }, storage: {from: () => bucket}};
  });
  const env = {SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_BUCKET: 'gallery', ASSETS: {fetch: async () => new Response('page')}, ...overrides};
  const call = (path, options = {}) => handler.fetch(new Request('https://gallery.example' + path, options), env);
  return {call, calls, bucket};
}
const auth = {Authorization: 'Bearer valid'};
test('public page works without project configuration; API fails closed', async () => {
  const f = fixture({SUPABASE_PUBLISHABLE_KEY: ''});
  assert.equal(await (await f.call('/')).text(), 'page');
  assert.equal((await f.call('/api/photos')).status, 503);
});
test('rejects a privileged secret key', async () => {
  assert.equal((await fixture({SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test'}).call('/api/photos')).status, 503);
});
test('anonymous and invalid-token requests never read storage', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/photos')).status, 401);
  assert.equal((await f.call('/api/photos', {headers: {Authorization: 'Bearer bad'}})).status, 401);
  assert.equal(f.calls.filter(c => c[0] === 'list').length, 0);
});
test('login omits refresh token and rejects cross-origin requests', async () => {
  const f = fixture();
  const options = {method: 'POST', body: JSON.stringify({email: 'a@example.com', password: 'password'})};
  assert.deepEqual(await (await f.call('/api/login', options)).json(), {access_token: 'valid'});
  assert.equal((await f.call('/api/login', {...options, headers: {Origin: 'https://evil.example'}})).status, 403);
});
test('listing ignores supplied owner and carries verified token to storage', async () => {
  const f = fixture();
  const response = await f.call('/api/photos?owner=someone-else', {headers: auth});
  assert.equal(response.status, 200);
  assert.equal(f.calls.find(c => c[0] === 'list')[1], owner);
  assert.equal(f.calls.find(c => c[0] === 'client')[3].global.headers.Authorization, 'Bearer valid');
});
test('upload uses verified user folder and new filename with no overwrite', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/photos', {method: 'POST', headers: {...auth, 'Content-Type': 'image/jpeg'}, body: new Uint8Array([255,216,255,217])})).status, 201);
  const call = f.calls.find(c => c[0] === 'upload');
  assert.ok(call[1].startsWith(owner + '/')); assert.equal(call[3].upsert, false);
});
test('oversized and disguised uploads never reach storage', async () => {
  const f = fixture();
  for (const [body, status] of [[new Uint8Array(1_000_001), 413], [new TextEncoder().encode('<script>'), 415]]) {
    assert.equal((await f.call('/api/photos', {method: 'POST', headers: {...auth, 'Content-Type': 'image/jpeg'}, body})).status, status);
  }
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
});
test('downloads only from signed-in folder; rejects injected path', async () => {
  const f = fixture();
  const response = await f.call('/api/photos/' + photo, {headers: auth});
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(f.calls.find(c => c[0] === 'download')[1], owner + '/' + photo);
  assert.equal((await f.call('/api/photos/other%2F' + photo, {headers: auth})).status, 400);
});
test('invalid page and storage failures return useful bounded errors', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/photos?offset=-1', {headers: auth})).status, 400);
  f.bucket.list = async () => ({error: {statusCode: '403', message: 'do not expose internals'}});
  const response = await f.call('/api/photos', {headers: auth});
  assert.equal(response.status, 403); assert.match((await response.json()).error, /policies/);
});
test('pagination returns the next offset without extra file exposure', async () => {
  const f = fixture();
  f.bucket.list = async () => ({data: Array.from({length:13}, () => ({name: photo}))});
  const page = await (await f.call('/api/photos?offset=12', {headers: auth})).json();
  assert.equal(page.photos.length,12); assert.equal(page.next,24);
});
