const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const maxVideoSizeBytes = 100 * 1024 * 1024;

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxVideoSizeBytes },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files are allowed'));
    }
    cb(null, true);
  },
});

const resourceBaseUrl =
  (process.env.RESOURCE_UPLOAD_URL || 'http://localhost:5000').replace(/\/$/, '');
const gatewaySecret = process.env.GATEWAY_SHARED_SECRET;

const forwardHeaders = () => ({
  'x-gateway-secret': gatewaySecret,
});

router.post(
  '/names-with-video',
  verifyToken,
  (req, res, next) => {
    uploadVideo.single('video')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Video size exceeds 100MB limit.' });
      }
      return res.status(400).json({ message: err.message || 'Invalid file upload.' });
    });
  },
  async (req, res) => {
    if (!gatewaySecret) {
      return res.status(500).json({ message: 'Server misconfiguration: missing GATEWAY_SHARED_SECRET' });
    }

    const name = req.body?.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Please enter a valid name.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please select a video file.' });
    }

    const form = new FormData();
    form.append('name', name.trim());
    form.append('video', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    try {
      const upstream = await axios.post(`${resourceBaseUrl}/names-with-video`, form, {
        headers: {
          ...form.getHeaders(),
          ...forwardHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      return res.status(upstream.status).json(upstream.data);
    } catch (error) {
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      console.error('Resource upload forward failed:', error.message);
      return res.status(502).json({ message: 'Resource service unavailable' });
    }
  }
);

router.get('/uploads', verifyToken, async (req, res) => {
  if (!gatewaySecret) {
    return res.status(500).json({ message: 'Server misconfiguration: missing GATEWAY_SHARED_SECRET' });
  }

  try {
    const upstream = await axios.get(`${resourceBaseUrl}/uploads`, {
      headers: forwardHeaders(),
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    console.error('Resource uploads list failed:', error.message);
    return res.status(502).json({ message: 'Resource service unavailable' });
  }
});

module.exports = router;
