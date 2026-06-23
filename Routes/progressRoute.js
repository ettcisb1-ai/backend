const express = require('express');
const router = express.Router();
const {
    markVideoWatched,
    getMyProgress,
    getMyCourseProgress,
    getUserProgressReport,
    getCourseProgressReport,
    getAllProgressAdmin,
} = require('../Controllers/progressController');
const { protect, authorize } = require('../Middlewares/auth');

// ─── User routes ──────────────────────────────────────────────────────────────
// FR-46: Record a video watch / update position
router.post('/watch', protect, markVideoWatched);

// FR-47: Get all course progress for logged-in user (dashboard)
router.get('/me', protect, getMyProgress);

// FR-47: Get progress for a specific course
router.get('/course/:courseId', protect, getMyCourseProgress);

// ─── Admin routes ─────────────────────────────────────────────────────────────
// FR-48: Admin overview of all progress records
router.get('/admin', protect, authorize('admin'), getAllProgressAdmin);

// FR-48: Progress report filtered by user
router.get('/admin/users/:userId', protect, authorize('admin'), getUserProgressReport);

// FR-48: Progress report filtered by course
router.get('/admin/courses/:courseId', protect, authorize('admin'), getCourseProgressReport);

module.exports = router;