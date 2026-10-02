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
  let videoReady = false;
  const path = (id, type) => `${id}.${type === 'video/mp4' ? 'mp4' : 'jpg'}`;
  async function enableVideo() {
    if (videoReady) return;
    const { data, error } = await client.storage.getBucket(env.SUPABASE_BUCKET);
    if (error) throw error;
    if (data.public) throw new Error('Media bucket must remain private');
    if (data.allowed_mime_types && !data.allowed_mime_types.includes('video/mp4')) {
      const result = await client.storage.updateBucket(env.SUPABASE_BUCKET, {
        public: false, fileSizeLimit: data.file_size_limit,
        allowedMimeTypes: [...data.allowed_mime_types, 'video/mp4']
      });
      if (result.error) throw result.error;
    }
    videoReady = true;
  }
  // A unique bucket exclusively owned by this ledger is required before enabling uploads.
  return {
    async put(id, bytes, type = 'image/jpeg') {
      if (type === 'video/mp4') await enableVideo();
      const { error } = await bucket.upload(path(id, type), bytes, {
        contentType: type, cacheControl: '0', upsert: true
      });
      if (error) throw error;
    },
    async get(id, type = 'image/jpeg') {
      const { data, error } = await bucket.download(path(id, type));
      if (error) throw error;
      return { body: data.stream() };
    },
    async delete(id, type = 'image/jpeg') {
      const { error } = await bucket.remove([path(id, type)]);
      if (error) throw error;
    }
  };
}
