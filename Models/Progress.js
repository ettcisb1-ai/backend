const mongoose = require('mongoose');

// Tracks which videos/lectures a user has watched per course
const progressSchema = new mongoose.Schema(
    {
        // FR-46: Track per user
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // FR-46: Track per course
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
        },
        // FR-46: Individual video watch records
        watchedVideos: [
            {
                video: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Video',
                    required: true,
                },
                // lectureTitle stored for quick display without full population
                lectureTitle: { type: String, default: '' },
                // Seconds watched so far
                watchedSeconds: { type: Number, default: 0 },
                // Total duration in seconds
                totalSeconds: { type: Number, default: 0 },
                // true when watchedSeconds >= 80% of totalSeconds
                completed: { type: Boolean, default: false },
                completedAt: { type: Date, default: null },
                lastWatchedAt: { type: Date, default: Date.now },
            },
        ],
        // FR-47: Percentage complete for this course (0-100)
        percentageComplete: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        // FR-47: Total videos in course (cached)
        totalVideos: {
            type: Number,
            default: 0,
        },
        // FR-47: Number of completed videos
        completedVideos: {
            type: Number,
            default: 0,
        },
        // Course completion status
        status: {
            type: String,
            enum: ['not_started', 'in_progress', 'completed'],
            default: 'not_started',
        },
        // When the user first started the course
        startedAt: {
            type: Date,
            default: null,
        },
        // When the user completed 100% of the course
        completedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Compound index so one doc per user+course
progressSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);