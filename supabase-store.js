const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

function createStore({ url, key, client } = {}) {
    if (!client && (!url || !key)) throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY before starting.');
    const db = client || createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const bucket = db.storage.from('photo-stream');
    return {
        async add(buffer, contentType, capturedAt) {
            const objectPath = `${randomUUID()}.${contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'}`;
            const { error: uploadError } = await bucket.upload(objectPath, buffer, { contentType, upsert: false });
            if (uploadError) throw uploadError;
            const { data, error } = await db.from('photos').insert({ object_path: objectPath, content_type: contentType, captured_at: capturedAt, size_bytes: buffer.length }).select().single();
            if (error) {
                // Never remove an uploaded file on an ambiguous database/network error.
                // An administrator can recover this object by its logged path.
                console.error('Photo metadata save failed; retained storage object:', objectPath);
                throw error;
            }
            return data;
        },
        async list(before) {
            let query = db.from('photos').select('*').order('id', { ascending: false }).limit(51);
            if (before) query = query.lt('id', before);
            const { data: rows, error } = await query;
            if (error) throw error;
            const page = rows.slice(0, 50);
            if (!page.length) return { images: [], next: null };
            const { data: links, error: signError } = await bucket.createSignedUrls(page.map(row => row.object_path), 3600);
            if (signError) throw signError;
            const signed = new Map(links.map(link => [link.path, link]));
            const images = page.map(row => {
                const link = signed.get(row.object_path);
                if (!link || link.error || !link.signedUrl) throw new Error('Unable to load a stored photo.');
                return { id: row.id, data: link.signedUrl, uploaded_at: row.uploaded_at, captured_at: row.captured_at };
            });
            return { images, next: rows.length > 50 ? String(page.at(-1).id) : null };
        },
        async remove(id) {
            const { data: photo, error } = await db.from('photos').select('object_path').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!photo) return false;
            const { error: storageError } = await bucket.remove([photo.object_path]);
            if (storageError) throw storageError;
            const { error: deleteError } = await db.from('photos').delete().eq('id', id);
            if (deleteError) throw deleteError;
            return true;
        }
    };
}
module.exports = createStore;
