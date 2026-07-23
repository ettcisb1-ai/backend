const express = require('express');
const router = express.Router();
const {
  getVideos,
  getVideoById,
  getVideosByCourse,
  getVideosByCategory,
  createVideo,
  updateVideo,
  deleteVideo,
  // FR-29, FR-32: Secure streaming
  getStreamToken,
  streamVideo,
  // FR-30 to FR-34: Security settings
  getVideoSecurity,
  updateVideoSecurity,
} = require('../Controllers/videoController');
const { protect, authorize } = require('../Middlewares/auth');

// ── FR-29, FR-32, FR-34: Secure Stream endpoint ───────────────────────────────
// Token is the auth mechanism — no user token required on this endpoint itself.
// Explicit OPTIONS handler so the browser preflight succeeds before the
// <video> element sends its first range request.
router.options('/stream/:token', (req, res) => {
  const origin = req.headers['origin'] || 'https://ettc.info';
  res.set({
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  });
  res.sendStatus(204);
});

router.get('/stream/:token',  streamVideo);
router.head('/stream/:token', streamVideo);

// Protected routes (available to authenticated users)
router.get('/', protect, getVideos);
router.get('/course/:courseId', protect, getVideosByCourse);
router.get('/category/:categoryId', protect, getVideosByCategory);
router.get('/:id', protect, getVideoById);

// FR-29, FR-32: Issue a signed stream token for a specific video
router.post('/:id/token', protect, getStreamToken);

// FR-30 to FR-34: Security settings (read/update)
router.get('/:id/security', protect, authorize('admin'), getVideoSecurity);
router.patch('/:id/security', protect, authorize('admin'), updateVideoSecurity);

// Admin-only routes
router.post('/', protect, authorize('admin'), createVideo);
router.put('/:id', protect, authorize('admin'), updateVideo);
router.delete('/:id', protect, authorize('admin'), deleteVideo);

module.exports = router;