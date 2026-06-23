const mongoose = require('mongoose');

// Individual notification record sent to a user
const notificationSchema = new mongoose.Schema(
    {
        // Recipient user (null = broadcast to all)
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        title: {
            type: String,
            required: [true, 'Please provide a notification title'],
            trim: true,
        },
        message: {
            type: String,
            required: [true, 'Please provide a notification message'],
            trim: true,
        },
        // FR-43: new_content | FR-44: subscription_expiry | FR-45: broadcast
        type: {
            type: String,
            enum: ['new_content', 'subscription_expiry', 'broadcast'],
            required: true,
        },
        // For new_content notifications — which course triggered it
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            default: null,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        // FR-45: target audience for broadcast
        audience: {
            type: String,
            enum: ['all', 'subscribed', 'expiring'],
            default: 'all',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);