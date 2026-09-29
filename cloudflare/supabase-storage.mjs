import { createClient } from '@supabase/supabase-js';

export function createPhotoStore(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_BUCKET)
    throw new Error('Missing private storage configuration');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options = {}) => fetch(input, {
      ...options, signal: AbortSignal.timeout(20_000)
    }) }
  });
  const bucket = client.storage.from(env.SUPABASE_BUCKET);
  // A unique bucket exclusively owned by this ledger is required before enabling uploads.
  return {
    async put(id, bytes) {
      const { error } = await bucket.upload(`${id}.jpg`, bytes, {
        contentType: 'image/jpeg', cacheControl: '0', upsert: true
      });
      if (error) throw error;
    },
    async get(id) {
      const { data, error } = await bucket.download(`${id}.jpg`);
      if (error) throw error;
      return { body: data.stream() };
    },
    async delete(id) {
      const { error } = await bucket.remove([`${id}.jpg`]);
      if (error) throw error;
    }
  };
}
