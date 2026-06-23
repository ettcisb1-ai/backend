const express = require('express');
const router = express.Router();
const {
    notifyNewContent,
    notifySubscriptionExpiry,
    broadcastNotification,
    getMyNotifications,
    markAsRead,
    getAdminNotificationHistory,
} = require('../Controllers/notificationController');
const { protect, authorize } = require('../Middlewares/auth');

// ─── User routes ──────────────────────────────────────────────────────────────
// FR-43 / FR-44: User fetches their own notifications
router.get('/me', protect, getMyNotifications);

// Mark notifications as read
router.patch('/read', protect, markAsRead);

// ─── Admin routes ─────────────────────────────────────────────────────────────
// FR-48: Admin notification history log
router.get('/admin', protect, authorize('admin'), getAdminNotificationHistory);

// FR-43: Trigger new-content notification for a course's enrolled users
router.post('/new-content', protect, authorize('admin'), notifyNewContent);

// FR-44: Trigger subscription-expiry reminder
router.post('/expiry-reminder', protect, authorize('admin'), notifySubscriptionExpiry);

// FR-45: Admin broadcast to all or specific users
router.post('/broadcast', protect, authorize('admin'), broadcastNotification);

module.exports = router;