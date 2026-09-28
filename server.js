const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Use memory storage instead of saving files to disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Global array to hold images in server memory (newest first)
global.photoStreamMemory = [];

app.use(express.static('public'));

app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        console.error('Upload failed: No file received.');
        return res.status(400).send('No file uploaded.');
    }
    
    // Convert the image file buffer into a Base64 string
    const base64Image = req.file.buffer.toString('base64');
    const timestamp = Date.now();
    
    // Store in memory list
    global.photoStreamMemory.unshift({
        id: timestamp,
        data: `data:${req.file.mimetype};base64,${base64Image}`
    });
    
    // Limit memory usage to the last 20 photos so it doesn't crash
    if (global.photoStreamMemory.length > 20) {
        global.photoStreamMemory.pop();
    }
    
    console.log(`Saved snapshot to memory`);
    res.status(200).send('Upload successful.');
});

app.get('/api/images', (req, res) => {
    res.json(global.photoStreamMemory);
});

app.listen(PORT, () => console.log(`In-memory server running on port ${PORT}`));
