const express = require('express');
const router = express.Router();
const {
  getCourses,
  getCourseById,
  checkCourseAccess,
  getMyCourses,
  createCourse,
  updateCourse,
  reorderCourse,
  deleteCourse,
  getCourseStudents,
  enrollStudentInCourse,
  unenrollStudentFromCourse,
} = require('../Controllers/courseController');
const { protect, authorize } = require('../Middlewares/auth');

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/', getCourses);

// ── IMPORTANT: specific sub-routes MUST come before the /:id wildcard ─────────

// FR-28: Student's own assigned courses (with full video data)
router.get('/my-courses', protect, getMyCourses);

// FR-28: Course access check for authenticated users
router.get('/:id/access', protect, checkCourseAccess);

// FR-26: Reorder modules/lectures within a course
router.patch('/:id/reorder', protect, authorize('admin'), reorderCourse);

// ── Admin: Enrolled Students Management per course ────────────────────────────
router.get('/:id/students', protect, authorize('admin'), getCourseStudents);
router.post('/:id/students/enroll', protect, authorize('admin'), enrollStudentInCourse);
router.delete('/:id/students/:userId', protect, authorize('admin'), unenrollStudentFromCourse);

// ── Wildcard param route — must be LAST among GET routes ──────────────────────
router.get('/:id', getCourseById);

// ── Admin-only routes ─────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin'), createCourse);
router.put('/:id', protect, authorize('admin'), updateCourse);
router.delete('/:id', protect, authorize('admin'), deleteCourse);

module.exports = router;
