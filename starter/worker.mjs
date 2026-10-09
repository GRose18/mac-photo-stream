// Server code: credentials are verified by Supabase; storage RLS also enforces ownership.
import { createClient } from '@supabase/supabase-js';
const MAX_BYTES = 1_000_000;
const PAGE_SIZE = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const filename = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(value, status = 200) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  }});
}
async function readLimited(request, limit) {
  if (!request.body) throw new Failure(400, 'No file or form data was sent.');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Failure(413, 'File or form is too large. Photos must be 1 MB or smaller.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
function photoType(bytes, mime) {
  const text = (start, end) => new TextDecoder().decode(bytes.slice(start, end));
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (mime === 'image/png' && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'png';
  if (mime === 'image/webp' && text(0,4) === 'RIFF' && text(8,12) === 'WEBP') return 'webp';
  throw new Failure(415, 'Choose a JPEG, PNG, or WebP image. Convert HEIC images first.');
}
function storageFailure(error) {
  const status = Number(error.statusCode || error.status);
  if (status === 429) return new Failure(429, 'Supabase is limiting requests. Check project usage and try later.');
  if (status === 403 || status === 401) return new Failure(403, 'Storage access denied. Check the two storage policies and your sign-in.');
  return new Failure(502, 'Storage request failed. Check your bucket name, project status, policies, and usage in Supabase.');
}
export function createHandler(makeClient = createClient) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env.SUPABASE_URL || '') ||
            env.SUPABASE_URL.includes('YOUR_PROJECT_ID') || !env.SUPABASE_PUBLISHABLE_KEY ||
            !env.SUPABASE_BUCKET) throw new Failure(503, 'Finish setup: check your Supabase URL, bucket, and publishable key.');
        if (!env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))
          throw new Failure(503, 'Use a Supabase publishable key (sb_publishable_), not a secret or service-role key.');
        const origin = request.headers.get('Origin');
        if (request.method !== 'GET' && origin && origin !== url.origin)
          throw new Failure(403, 'Open this form on your own gallery website.');
        const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
        const client = makeClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
          auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
          global: {headers: token ? {Authorization: `Bearer ${token}`} : {}}
        });
        if (url.pathname === '/api/login' && request.method === 'POST') {
          let input;
          try { input = JSON.parse(new TextDecoder().decode(await readLimited(request, 4096))); }
          catch (error) { if (error.status) throw error; throw new Failure(400, 'Invalid sign-in form.'); }
          if (!input || typeof input.email !== 'string' || typeof input.password !== 'string' ||
              input.email.length > 320 || input.password.length > 128)
            throw new Failure(400, 'Enter your email address and password.');
          const {data, error} = await client.auth.signInWithPassword({email: input.email, password: input.password});
          if (error || !data.session) throw new Failure(error?.status === 429 ? 429 : 401,
            error?.status === 429 ? 'Too many sign-in attempts. Wait before trying again.' : 'Could not sign in. Check your email, password, and confirmed user in Supabase.');
          // Deliberately omit the refresh token. Reloading requires a fresh sign-in.
          return json({access_token: data.session.access_token});
        }
        if (!token) throw new Failure(401, 'Please sign in.');
        const {data: identity, error: authError} = await client.auth.getUser(token);
        if (authError || !uuid.test(identity?.user?.id || '')) throw new Failure(401, 'Your session ended. Please sign in again.');
        const userId = identity.user.id;
        const bucket = client.storage.from(env.SUPABASE_BUCKET);
        if (url.pathname === '/api/photos' && request.method === 'GET') {
          const offset = Number(url.searchParams.get('offset') || 0);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new Failure(400, 'Invalid page.');
          const {data, error} = await bucket.list(userId, {limit: PAGE_SIZE + 1, offset, sortBy: {column: 'name', order: 'asc'}});
          if (error) throw storageFailure(error);
          return json({photos: data.slice(0, PAGE_SIZE).filter(p => filename.test(p.name)).map(p => ({name: p.name, created_at: p.created_at})),
            next: data.length > PAGE_SIZE ? offset + PAGE_SIZE : null});
        }
        if (url.pathname === '/api/photos' && request.method === 'POST') {
          const bytes = await readLimited(request, MAX_BYTES);
          const mime = request.headers.get('Content-Type');
          const extension = photoType(bytes, mime);
          const name = `${crypto.randomUUID()}.${extension}`;
          const {error} = await bucket.upload(`${userId}/${name}`, bytes, {contentType: mime, upsert: false});
          if (error) throw storageFailure(error);
          return json({name}, 201);
        }
        if (url.pathname.startsWith('/api/photos/') && request.method === 'GET') {
          const name = url.pathname.slice('/api/photos/'.length);
          if (!filename.test(name)) throw new Failure(400, 'Invalid photo name.');
          // No client-supplied owner/folder: always scope reads to the verified user.
          const {data, error} = await bucket.download(`${userId}/${name}`);
          if (error) throw storageFailure(error);
          const mime = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp'}[name.split('.').pop().toLowerCase()];
          return new Response(data, {headers: {'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
        }
        throw new Failure(404, 'Page not found.');
      } catch (error) {
        return json({error: error.status ? error.message : 'Service unavailable. Check your project settings and try again.'}, error.status || 503);
      }
    }
  };
}
export default createHandler();
