// routes/uploads.js — Banner image upload
// Handles both Cloudinary (production) and local disk (development).
const router  = require('express').Router();
const { authenticate, requireOrganizer }                    = require('../middleware/auth');
const { upload, validateMagicBytes, handleUploadError, hasCloudinary } = require('../middleware/upload');

// POST /api/uploads/banner
router.post(
  '/banner',
  authenticate,
  requireOrganizer,
  upload.single('banner'),
  handleUploadError,
  validateMagicBytes,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Cloudinary: req.file.path is the full CDN URL
    // Local disk: req.file.filename is the saved filename
    const fileUrl = hasCloudinary
      ? req.file.path          // e.g. https://res.cloudinary.com/demo/image/upload/...
      : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    return res.json({
      success:  true,
      message:  'Banner uploaded',
      data: {
        url:      fileUrl,
        filename: req.file.filename || req.file.public_id,
        size:     req.file.size,
        mode:     hasCloudinary ? 'cloudinary' : 'local',
      },
    });
  }
);

module.exports = router;
