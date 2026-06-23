const express = require('express');
const router = express.Router();
const {
    getUsersReport,
    getRevenueReport,
    getCoursesReport,
    getCategoriesReport,
    getPlansReport,
    getMonthlyRevenueReport,
    getActiveStudentsReport,
    getCoursePerformanceReport,
} = require('../Controllers/reportsController');
const { protect, authorize } = require('../Middlewares/auth');

// All report routes require admin auth
router.use(protect, authorize('admin'));

router.get('/users', getUsersReport);
router.get('/revenue', getRevenueReport);
router.get('/courses', getCoursesReport);
router.get('/categories', getCategoriesReport);
router.get('/plans', getPlansReport);
router.get('/monthly-revenue', getMonthlyRevenueReport);
router.get('/active-students', getActiveStudentsReport);
router.get('/course-performance', getCoursePerformanceReport);

module.exports = router;