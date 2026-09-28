const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');

if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}_snapshot.jpg`)
});
const upload = multer({ storage: storage });

app.use(express.static('public'));

app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    console.log(`Saved: ${req.file.filename}`);
    res.status(200).send('Upload successful.');
});

app.get('/api/images', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) return res.status(500).json([]);
        const images = files.filter(file => !file.startsWith('.') && /\.(jpg|jpeg|png)\$/i.test(file));
        res.json(images.reverse());
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
