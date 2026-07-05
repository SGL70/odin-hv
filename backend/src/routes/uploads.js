const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).slice(0, 5) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, Object.keys(EXT_BY_MIME).includes(file.mimetype)),
});

// Fältrapportfoton (se FieldReportView.tsx) — bilden skalas redan ner client-side innan
// uppladdning, gränsen här är bara ett skyddsnät. Returnerar en vanlig URL som lagras rakt
// av som attributes.photo_url, precis som Trafikverkets kamera-PhotoUrl redan hanteras.
router.post('/', requireAuth, requireRole('editor', 'admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen giltig bildfil bifogad' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
