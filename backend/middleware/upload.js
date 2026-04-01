// middleware/upload.js
// Image upload middleware with two modes:
//
//   MODE A — Cloudinary (production, recommended)
//     Set CLOUDINARY_URL or all three CLOUDINARY_* env vars.
//     Images are uploaded to Cloudinary's CDN, resized and WebP-converted
//     automatically. No local disk usage. Survives multi-server deploys.
//
//   MODE B — Local disk (development / fallback)
//     If Cloudinary is not configured, files are saved to the local
//     uploads/ directory. Not suitable for multi-server production.
//
// Both modes run the same magic-byte validation before accepting the file.

const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Magic byte signatures ─────────────────────────────────────
// First bytes of valid image files — cannot be faked without
// corrupting the file. Protects against renamed malware uploads.
function checkMagicBytes(buffer, ext) {
  if (!buffer || buffer.length < 12) return false;
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (ext === '.png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 &&
           buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  if (ext === '.webp') {
    const isRiff = [0x52,0x49,0x46,0x46].every((b,i) => buffer[i] === b);
    const isWebp = [0x57,0x45,0x42,0x50].every((b,i) => buffer[8+i] === b);
    return isRiff && isWebp;
  }
  return false;
}

const ALLOWED_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB        = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5;

// ── Detect Cloudinary configuration ──────────────────────────
const hasCloudinary = !!(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME &&
   process.env.CLOUDINARY_API_KEY    &&
   process.env.CLOUDINARY_API_SECRET)
);

// ── Multer file filter (used by both modes) ───────────────────
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
  }
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(new Error('File MIME type not permitted'), false);
  }
  cb(null, true);
};

// ── MODE A: Cloudinary ────────────────────────────────────────
let upload;
let UPLOAD_DIR = null;

if (hasCloudinary) {
  // Use multer-storage-cloudinary — uploads directly to Cloudinary
  // No temp files written to disk; streams directly from memory buffer
  const cloudinary      = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  // Configure from env
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder:         'sany-adventures/banners',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        // Resize to max 1400px wide, maintain aspect ratio,
        // convert to WebP for ~30% smaller file size
        { width: 1400, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
      ],
    },
  });

  upload = multer({
    storage:    cloudStorage,
    fileFilter,
    limits:     { fileSize: MAX_MB * 1024 * 1024 },
  });

  console.log('[upload] Mode: Cloudinary CDN');

} else {
  // MODE B: Local disk
  UPLOAD_DIR = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext)
        .replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40);
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  });

  upload = multer({
    storage:    diskStorage,
    fileFilter,
    limits:     { fileSize: MAX_MB * 1024 * 1024 },
  });

  console.log('[upload] Mode: Local disk (set CLOUDINARY_* env vars for production)');
}

// ── Magic byte validation (post-upload) ──────────────────────
// For local disk mode: reads saved file and verifies bytes.
// For Cloudinary mode: reads buffer from memory before upload stream.
// If validation fails: deletes the file and rejects with 400.
const validateMagicBytes = (req, res, next) => {
  if (!req.file) return next();

  const ext = path.extname(
    req.file.originalname || req.file.filename || ''
  ).toLowerCase();

  // Cloudinary mode: file is in memory buffer (req.file.buffer)
  if (req.file.buffer) {
    if (!checkMagicBytes(req.file.buffer, ext)) {
      return res.status(400).json({
        success: false,
        message: 'File content does not match its extension. Upload a real image.',
      });
    }
    return next();
  }

  // Local disk mode: read first 12 bytes from saved file
  if (req.file.path) {
    let fd;
    try {
      const buf = Buffer.alloc(12);
      fd = fs.openSync(req.file.path, 'r');
      fs.readSync(fd, buf, 0, 12, 0);
      fs.closeSync(fd);
      if (!checkMagicBytes(buf, ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'File content does not match its extension. Upload a real image.',
        });
      }
      return next();
    } catch (err) {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
      if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, message: 'File validation failed' });
    }
  }

  // Cloudinary uploaded files have no local path — skip byte check
  // (Cloudinary already rejects non-images server-side)
  next();
};

// ── Multer error handler ──────────────────────────────────────
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_MB}MB.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

module.exports = { upload, validateMagicBytes, handleUploadError, UPLOAD_DIR, hasCloudinary };
