const express = require('express');
const router = express.Router();
const {
    getUserAnalytics,
    getCourseAnalytics,
    getRevenueAnalytics,
    getVideoAnalytics,
    getAnalyticsOverview,
} = require('../Controllers/analyticsController');
const { protect, authorize } = require('../Middlewares/auth');

// All analytics routes require admin auth
router.use(protect, authorize('admin'));

router.get('/overview', getAnalyticsOverview);
router.get('/users', getUserAnalytics);
router.get('/courses', getCourseAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/videos', getVideoAnalytics);

module.exports = router;