const Notification = require('../Models/Notification');
const User = require('../Models/User');
const Course = require('../Models/Course');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: dispatch notification docs for a list of userIds
// ─────────────────────────────────────────────────────────────────────────────
const dispatchToUsers = async (userIds, payload) => {
    const docs = userIds.map((uid) => ({ ...payload, user: uid }));
    return Notification.insertMany(docs);
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-43: Notify enrolled users when new content is added to a course
//  Called internally from courseController / videoController after a new video
//  is published.  Also exposed as POST /api/notifications/new-content
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Trigger new-content notification for enrolled users of a course
// @route   POST /api/notifications/new-content
// @access  Private / Admin
const notifyNewContent = async (req, res) => {
    try {
        const { courseId, title, message } = req.body;

        if (!courseId || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'courseId, title and message are required',
            });
        }

        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        // Find all users enrolled in this course
        const enrolledUsers = await User.find({ courses: courseId.toString() }).select('_id');
        if (!enrolledUsers.length) {
            return res.status(200).json({
                success: true,
                message: 'No enrolled users found for this course',
                data: { sent: 0 },
            });
        }

        const userIds = enrolledUsers.map((u) => u._id);
        await dispatchToUsers(userIds, {
            title,
            message,
            type: 'new_content',
            course: courseId,
            audience: 'all',
        });

        return res.status(201).json({
            success: true,
            message: `Notification sent to ${userIds.length} enrolled user(s)`,
            data: { sent: userIds.length },
        });
    } catch (error) {
        console.error('notifyNewContent error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-44: Notify users whose subscription is about to expire
//  @route   POST /api/notifications/expiry-reminder
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const notifySubscriptionExpiry = async (req, res) => {
    try {
        const { daysBeforeExpiry = 3 } = req.body;

        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + Number(daysBeforeExpiry));

        // Find subscribed users whose expiryDate falls within [now, cutoff]
        // expiryDate is stored as a string ("June 10, 2026") in User model
        // We'll load all subscribed users and filter by parsed date
        const subscribedUsers = await User.find({ subscribed: true }).select(
            '_id expiryDate name email'
        );

        const expiring = subscribedUsers.filter((u) => {
            if (!u.expiryDate) return false;
            const exp = new Date(u.expiryDate);
            return exp >= now && exp <= cutoff;
        });

        if (!expiring.length) {
            return res.status(200).json({
                success: true,
                message: 'No users with upcoming expiry found',
                data: { sent: 0 },
            });
        }

        const userIds = expiring.map((u) => u._id);
        await dispatchToUsers(userIds, {
            title: 'Subscription Expiring Soon',
            message: `Your subscription expires within ${daysBeforeExpiry} day(s). Renew now to keep access.`,
            type: 'subscription_expiry',
            audience: 'expiring',
        });

        return res.status(201).json({
            success: true,
            message: `Expiry reminder sent to ${userIds.length} user(s)`,
            data: { sent: userIds.length },
        });
    } catch (error) {
        console.error('notifySubscriptionExpiry error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-45: Admin sends broadcast to all or specific users
//  @route   POST /api/notifications/broadcast
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const broadcastNotification = async (req, res) => {
    try {
        const { title, message, audience = 'all', userIds: specificUserIds } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'title and message are required',
            });
        }

        let targetUserIds = [];

        if (specificUserIds && Array.isArray(specificUserIds) && specificUserIds.length > 0) {
            // Targeted broadcast to specific users
            targetUserIds = specificUserIds;
        } else {
            // Audience-based broadcast
            let query = {};
            if (audience === 'subscribed') query.subscribed = true;
            else if (audience === 'expiring') {
                const now = new Date();
                const cutoff = new Date(now);
                cutoff.setDate(cutoff.getDate() + 7);
                const subscribedUsers = await User.find({ subscribed: true }).select('_id expiryDate');
                targetUserIds = subscribedUsers
                    .filter((u) => {
                        const exp = new Date(u.expiryDate);
                        return exp >= now && exp <= cutoff;
                    })
                    .map((u) => u._id);
            }

            if (audience !== 'expiring') {
                const users = await User.find(query).select('_id');
                targetUserIds = users.map((u) => u._id);
            }
        }

        if (!targetUserIds.length) {
            return res.status(200).json({
                success: true,
                message: 'No matching users found',
                data: { sent: 0 },
            });
        }

        await dispatchToUsers(targetUserIds, {
            title,
            message,
            type: 'broadcast',
            audience,
        });

        return res.status(201).json({
            success: true,
            message: `Broadcast sent to ${targetUserIds.length} user(s)`,
            data: { sent: targetUserIds.length },
        });
    } catch (error) {
        console.error('broadcastNotification error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Get my notifications
//  @route   GET /api/notifications/me
//  @access  Private / User
// ─────────────────────────────────────────────────────────────────────────────
const getMyNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .populate('course', 'title thumbnail')
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = notifications.filter((n) => !n.isRead).length;

        return res.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    } catch (error) {
        console.error('getMyNotifications error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Mark notification(s) as read
//  @route   PATCH /api/notifications/read
//  @access  Private / User
// ─────────────────────────────────────────────────────────────────────────────
const markAsRead = async (req, res) => {
    try {
        const { notificationIds } = req.body; // array of ids, or omit to mark all

        const filter = { user: req.user._id, isRead: false };
        if (notificationIds && notificationIds.length) {
            filter._id = { $in: notificationIds };
        }

        await Notification.updateMany(filter, { isRead: true });

        return res.status(200).json({ success: true, message: 'Marked as read' });
    } catch (error) {
        console.error('markAsRead error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Get all notifications (history log)
//  @route   GET /api/notifications/admin
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const getAdminNotificationHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.type) filter.type = req.query.type;

        const [notifications, total] = await Promise.all([
            Notification.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Notification.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: { notifications, total, page, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('getAdminNotificationHistory error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    notifyNewContent,
    notifySubscriptionExpiry,
    broadcastNotification,
    getMyNotifications,
    markAsRead,
    getAdminNotificationHistory,
};