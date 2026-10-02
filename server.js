const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const createStore = require('./supabase-store');

function createApp({ store, adminPassword = process.env.ADMIN_PASSWORD } = {}) {
    store ||= createStore({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY });
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 2 } });
    app.use(express.static(path.join(__dirname, 'public')));
    app.post('/upload', upload.single('image'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
        const bytes = req.file.buffer;
        const isJpeg = bytes.length > 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
        const isPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isWebp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        const type = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : null;
        if (!type) return res.status(415).json({ error: 'Upload a JPEG, PNG, or WebP image.' });
        let capturedAt = null;
        if (req.body.captured_at) {
            const date = new Date(req.body.captured_at);
            if (!Number.isFinite(date.getTime())) return res.status(400).json({ error: 'captured_at must be a valid date.' });
            capturedAt = date.toISOString();
        }
        const photo = await store.add(bytes, type, capturedAt);
        res.status(201).json({ id: photo.id, uploaded_at: photo.uploaded_at, captured_at: photo.captured_at });
    });
    app.get('/api/images', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const before = req.query.before;
        if (before !== undefined && (typeof before !== 'string' || !/^\d{1,18}$/.test(before))) return res.status(400).json({ error: 'Invalid page cursor.' });
        const { images, next } = await store.list(before);
        if (next) res.set('X-Next-Cursor', next);
        res.json(images);
    });
    app.delete('/api/images/:id', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!adminPassword) return res.status(503).json({ error: 'Set ADMIN_PASSWORD in Render to enable deletion.' });
        const digest = value => createHash('sha256').update(value).digest();
        if (!timingSafeEqual(digest(req.get('Authorization') || ''), digest(`Bearer ${adminPassword}`))) return res.status(401).json({ error: 'Incorrect admin password.' });
        if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid photo ID.' });
        if (!await store.remove(req.params.id)) return res.status(404).json({ error: 'This photo is no longer in the gallery.' });
        res.status(204).end();
    });
    app.use((error, req, res, next) => {
        if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one image, at most 6 MB.' });
        console.error('Storage request failed:', error.code || error.name || 'unknown');
        res.status(503).json({ error: 'Storage is unavailable. Your local photo is safe; retry later.' });
    });
    return app;
}
if (require.main === module) createApp().listen(process.env.PORT || 3000, () => console.log('Photo Stream running with Supabase storage'));
module.exports = createApp;
