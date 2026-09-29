import { charge, reserve, LIMITS, HttpError } from './budget.mjs';
import { HTML as LEGACY_HTML } from './page.mjs';
import { HTML } from './game-page.mjs';
import { handleGame, readSession, hash } from './game.mjs';
import { createPhotoStore } from './supabase-storage.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || '');
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
async function digest(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([digest(enc.encode(a)), digest(enc.encode(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function bodyWithinLimit(request) {
  if (!request.body) throw new HttpError(400, 'Missing JPEG.');
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > LIMITS.imageBytes) { await reader.cancel(); throw new HttpError(413, 'JPEG must be at most 1 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || length < 4)
    throw new HttpError(415, 'Upload a JPEG.');
  return bytes;
}

export default {
  async fetch(request, env) {
    try {
      if (!env.ADMIN_PASSWORD || !env.UPLOAD_TOKEN) return json({ error: 'Service is not configured.' }, 503);
      if (env.FREE_PLAN_SETUP_VERIFIED !== 'true') return json({ error: 'Free-plan and storage setup must be verified before enabling this service.' }, 503);
      const url = new URL(request.url);
      if (request.method === 'GET' && ['/', '/join'].includes(url.pathname)) return new Response(HTML, {headers: {
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"
      }});
      const upload = request.method === 'POST' && url.pathname === '/upload';
      const authorization = request.headers.get('Authorization') || '';
      let allowed = false;
      if (upload) allowed = await same(authorization, `Bearer ${env.UPLOAD_TOKEN}`);
      else if (authorization.startsWith('Basic ')) {
        try { allowed = await same(atob(authorization.slice(6)), `admin:${env.ADMIN_PASSWORD}`); } catch {}
      }
      if (!upload && !allowed) allowed = (await readSession(request, env))?.role === 'admin';
      const game = url.pathname.startsWith('/api/game/') || url.pathname.startsWith('/api/auth/');
      if (game) {
        if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed.'},405);
        if (request.method === 'POST' && (request.headers.get('X-Sclshi-Action') !== '1' ||
            (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)))
          return json({error:'Same-origin action required.'},403);
        const headers = new Headers({'Content-Type':request.headers.get('Content-Type')||'',
          'Cookie':request.headers.get('Cookie')||'', 'X-Verified-Admin':allowed?'yes':'no',
          'X-Client-Hash':await hash((request.headers.get('CF-Connecting-IP')||'local') + env.ADMIN_PASSWORD)});
        const stub = env.GALLERY.get(env.GALLERY.idFromName('supabase-gallery-v1'));
        return stub.fetch(new Request('https://internal'+url.pathname+url.search, {method:request.method,headers,body:request.body,duplex:'half'}));
      }
      if (!allowed) return new Response('Authentication required', { status: 401, headers: {
        'WWW-Authenticate': 'Basic realm="Private Photo Stream"', 'Cache-Control': 'no-store'
      } });
      if (request.method === 'GET' && url.pathname === '/legacy') return new Response(LEGACY_HTML, { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
      } });
      // A single fixed ledger is essential: do not create one object per device/request.
      const stub = env.GALLERY.get(env.GALLERY.idFromName('supabase-gallery-v1'));
      if (upload) {
        const id = request.headers.get('X-Photo-ID');
        if (!validId(id)) throw new HttpError(400, 'X-Photo-ID must be a stable UUID, reused on retries.');
        const captured = request.headers.get('X-Captured-At');
        if (!captured || !Number.isFinite(Date.parse(captured))) throw new HttpError(400, 'X-Captured-At must be an ISO timestamp.');
        const bytes = await bodyWithinLimit(request);
        return stub.fetch(new Request('https://internal/upload', { method: 'POST', body: bytes, headers: {
          'X-Photo-ID': id, 'X-Captured-At': new Date(captured).toISOString(), 'X-SHA256': await digest(bytes),
          'X-Timestamp-Kind': request.headers.get('X-Timestamp-Kind') === 'legacy-upload' ? 'legacy-upload' : 'capture'
        } }));
      }
      if (request.method === 'GET' && ['/api/images', '/api/usage'].includes(url.pathname))
        return stub.fetch(new Request('https://internal' + url.pathname + url.search));
      const match = url.pathname.match(/^\/api\/images\/([^/]+)$/);
      if (match && validId(match[1]) && ['GET', 'DELETE'].includes(request.method)) {
        if (request.method === 'DELETE' && request.headers.get('X-Photo-Action') !== 'delete')
          throw new HttpError(403, 'Explicit delete action required.');
        if (request.method === 'DELETE' && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) throw new HttpError(403, 'Same-origin action required.');
        return stub.fetch(new Request('https://internal' + url.pathname, { method: request.method }));
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) { return json({ error: error.status ? error.message : 'Storage unavailable. Keep your local photo and retry.' }, error.status || 503); }
  }
};

export class Gallery {
  constructor(ctx, env, photoStore = null) {
    this.ctx = ctx; this.env = env;
    this.photos = photoStore || createPhotoStore(env);
  }
  async fetch(request) {
    // Serializes checks, reservations and storage access. Persist before uploading;
    // an interrupted operation must over-count, never under-count.
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await this.handle(request); }
      catch (error) { return json({ error: error.status ? error.message : 'Storage unavailable. Keep your local photo and retry.' }, error.status || 503); }
    });
  }
  async spend(kind, transferBytes = 8192) {
    const store = this.ctx.storage;
    await store.put('usage', charge(await store.get('usage'), kind, new Date(), transferBytes));
    // No refund after failed/ambiguous storage operations.
  }
  async handle(request) {
    const game = await handleGame(this, request);
    if (game) return game;
    const store = this.ctx.storage;
    const url = new URL(request.url);
    if (url.pathname === '/api/usage') return json({ totals: await store.get('totals') || { bytes: 0, objects: 0 }, usage: await store.get('usage'), limits: LIMITS });
    if (url.pathname === '/upload') {
      const id = request.headers.get('X-Photo-ID');
      const key = 'photo:' + id;
      const bytes = await request.arrayBuffer();
      const sha = request.headers.get('X-SHA256');
      let record = await store.get(key);
      if (record && (record.sha256 !== sha || record.size !== bytes.byteLength)) throw new HttpError(409, 'Photo ID already belongs to different bytes.');
      if (record?.state === 'deleting' || record?.state === 'deleted') throw new HttpError(410, 'This photo was explicitly deleted. Do not upload it again.');
      if (record?.state === 'ready') return json({ id, stored: true, sha256: sha });
      await this.spend('writes');
      if (!record) {
        record = { id, size: bytes.byteLength, sha256: sha, captured_at: request.headers.get('X-Captured-At'), timestamp_kind: request.headers.get('X-Timestamp-Kind') || 'capture', uploaded_at: new Date().toISOString(), state: 'pending' };
        await store.transaction(async tx => {
          const totals = reserve(await tx.get('totals'), bytes.byteLength);
          await tx.put({ totals, [key]: record });
        });
      }
      // Same ID retries overwrite the same key and reuse the reservation.
      // The Worker hashed the received bytes. Acknowledge only after Supabase
      // confirms storage and the metadata transaction commits.
      await this.photos.put(id, bytes);
      record.state = 'ready';
      await store.transaction(async tx => {
        await tx.put(key, record);
        await tx.put(`index:${record.uploaded_at}:${id}`, id);
      });
      return json({ id, stored: true, sha256: sha }, 201);
    }
    if (url.pathname === '/api/images') {
      const before = url.searchParams.get('before');
      if (before && !/^index:[0-9TZ:.\-]+:[0-9a-f-]{36}$/.test(before)) throw new HttpError(400, 'Invalid cursor.');
      const rows = await store.list({ prefix: 'index:', reverse: true, limit: 21, ...(before ? { end: before } : {}) });
      const entries = [...rows.entries()];
      const images = [];
      for (const [, id] of entries.slice(0, 20)) {
        const record = await store.get('photo:' + id);
        if (record?.state === 'ready') images.push({ id, captured_at: record.captured_at, timestamp_kind: record.timestamp_kind || 'capture', uploaded_at: record.uploaded_at, data: `/api/images/${id}` });
      }
      return json({ images, next: entries.length > 20 ? entries[19][0] : null });
    }
    const id = url.pathname.split('/').pop();
    const key = 'photo:' + id;
    const record = await store.get(key);
    if (!record || record.state === 'deleted') throw new HttpError(404, 'Photo not found.');
    if (request.method === 'DELETE') {
      if (await store.get('game:card:' + id)) throw new HttpError(409, 'This photo is a collectible. Retire the card in Headquarters instead of deleting its photo.');
      record.state = 'deleting'; await store.put(key, record);
      await this.spend('deletes');
      await this.photos.delete(id);
      await store.transaction(async tx => {
        const totals = await tx.get('totals');
        if (!totals || totals.bytes < record.size || totals.objects < 1) throw new Error('Ledger inconsistency');
        await tx.put('totals', { bytes: totals.bytes - record.size, objects: totals.objects - 1 });
        // Tombstone prevents retries from resurrecting deliberately deleted photos.
        await tx.put(key, { ...record, state: 'deleted' });
        await tx.delete(`index:${record.uploaded_at}:${id}`);
      });
      return new Response(null, { status: 204 });
    }
    if (record.state !== 'ready') throw new HttpError(409, 'Upload pending or deletion in progress.');
    await this.spend('reads', record.size + 8192);
    const object = await this.photos.get(id);
    if (!object) throw new HttpError(503, 'Stored photo is temporarily unavailable.');
    return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
}
