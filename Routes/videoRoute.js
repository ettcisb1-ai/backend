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
// Token is the auth mechanism — no user token required on this endpoint itself
// (the stream token already encodes the user's identity and a 2-hour TTL)
router.get('/stream/:token', streamVideo);

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